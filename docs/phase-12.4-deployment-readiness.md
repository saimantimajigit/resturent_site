# Phase 12.4 deployment and recovery readiness

## Decision and current readiness

SAVORÉ is a fictional client-demo application. The local setup is suitable for a controlled demo: Next.js 15.5.28, Prisma 7.10.1, and PostgreSQL 17 in the `savore-postgres-dev` container, bound only to host loopback port 5433 with the dedicated `savore-postgres-dev-data` volume. The app uses simulated payment/order-value records; this setup is not production payment processing.

For a production pilot, use a separately provisioned HTTPS Next.js runtime and a separately provisioned managed PostgreSQL database on private networking. Do not promote or expose the demo database. A container runtime is also supported by the included Dockerfile, but no provider, public domain, ingress, payment processor, or production database has been selected or verified. No service has been provisioned and nothing has been deployed.

Production release remains blocked on a real domain, TLS and trusted-ingress verification, production secrets, an isolated database, restored-backup verification outside the development host, operational alerting, and accessibility/browser acceptance. This document is a readiness plan, not a production-readiness certification.

## Environment contract

`npm start` validates runtime configuration before launching Next.js. Errors name missing or invalid variables only; the validator does not print values. `DATABASE_URL` is parsed for PostgreSQL protocol/host/database but is never logged. The public URL must be HTTPS except for loopback smoke tests. Only supported proxy-header names are accepted.

| Variable | Required at runtime | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | Yes | PostgreSQL connection URL; production should use the provider's TLS-enabled private endpoint. |
| `RESTAURANT_ID` | Yes | Restaurant/tenant scope used by customer and staff flows. |
| `SAVORE_TRUSTED_CLIENT_IP_HEADER` | Yes | One of `x-real-ip`, `cf-connecting-ip`, or `true-client-ip`, overwritten by the trusted ingress. |
| `NEXT_PUBLIC_SITE_URL` | Yes | Canonical public origin used for metadata; HTTPS required except for loopback smoke tests. It is non-secret and is supplied at Docker build time as well as runtime. |
| `PORT`, `HOSTNAME` | Platform | Next.js listener settings; the container defaults to port 3000 and `0.0.0.0`. |
| `NODE_ENV` | Platform | Set to `production` by the runtime/container. |

`MIGRATION_DATABASE_URL` is a separate deployment-job secret for `prisma migrate deploy` and status checks. Do not inject it into the Next.js runtime container. Grant the migration login only the target database/schema access needed to apply reviewed migrations; keep bootstrap/extension installation authority in a separately controlled operator process.

Production-style example with placeholders only (do not copy the example values):

```dotenv
DATABASE_URL=postgresql://APP_USER:REPLACE_ME@PRIVATE_DB_HOST:5432/APP_DB?schema=public&sslmode=require
RESTAURANT_ID=REPLACE_WITH_RESTAURANT_ID
SAVORE_TRUSTED_CLIENT_IP_HEADER=x-real-ip
NEXT_PUBLIC_SITE_URL=https://REPLACE_WITH_VERIFIED_PUBLIC_HOST
NODE_ENV=production
PORT=3000
HOSTNAME=0.0.0.0
```

Never put a real `.env` file, password, private key, or database URL in Git, a container build argument, image layer, browser bundle, support ticket, or log. Inject the runtime and migration secrets separately from the hosting platform's secret manager. `POSTGRES_USER`, `POSTGRES_PASSWORD`, and `POSTGRES_DB` are container initialization metadata and do not rotate an already-initialized PostgreSQL role; `DEMO_HOST_PASSWORD` is demo seeding/testing only. Do not run the demo seed in production. `SAVORE_NEXT_DEV_DIST_DIR` and the `PHASE*` base URLs are development/test-only.

The Docker builder uses a fixed, non-secret local placeholder database URL only to let Prisma 7 evaluate its datasource while generating the client. It does not connect to that address. Supply the verified non-secret canonical URL with `--build-arg NEXT_PUBLIC_SITE_URL=https://your-verified-host`; never pass database credentials as build arguments.

## Deployment architecture and network controls

- Terminate HTTPS at a maintained ingress/load balancer. Redirect HTTP to HTTPS there. The application does not emit HSTS; enable HSTS only after the real hostname, certificate renewal, redirect behavior, and every covered subdomain have been verified. Do not use `includeSubDomains` or preload before all subdomains are HTTPS-only.
- Keep PostgreSQL off the public internet; allow connections only from the application network. Require TLS with certificate verification according to the selected provider. The local `localhost:5433` connection is for development only.
- The app trusts only one allowlisted client-IP header for rate-limit identity. Configure the ingress to remove any inbound client-supplied copy and overwrite it with the observed client address; block direct access to the application origin. Verify this behavior from the deployed ingress and network perimeter. Local unit/integration tests cannot prove proxy behavior.
- Same-origin validation and secure production session cookies are application controls. Preserve them at the proxy; do not add permissive CORS rules. Keep API `private, no-store` responses uncacheable through any CDN.
- Current CSP is deliberately partial: `base-uri 'self'; object-src 'none'; frame-ancestors 'none'`. It does not restrict `default-src`, scripts, styles, images, fonts, connections, or form destinations. Do not describe it as a complete CSP. Stage a report-only policy with a reporting endpoint, inspect violations across customer, staff, admin, checkout, and QR flows, then enforce a tested nonce/hash and explicit-source policy with rollback.
- The image includes local `public/` assets. PostgreSQL is the persistent application data store; the container filesystem must not hold user uploads or irreplaceable state. Use a separate private object-storage design before adding uploads.

## Container packaging

The root `Dockerfile` has dependency, build, and non-root runtime stages, pins the official Node 22 Bookworm image by digest, installs OpenSSL for Prisma's Linux engine selection, uses the committed npm lockfile, generates Prisma Client in the builder, builds the configured `.next-prod` output, validates runtime configuration, and starts Next.js directly as PID 1 for graceful signal handling. The image exposes a database-aware `/api/health` check. `.dockerignore` excludes environment files, Git history, dependencies, build outputs, test outputs, and database archives. The runtime process runs as the built-in `node` user. The production image is not built with local `.env` content. Schedule periodic base-image/security updates and rebuild to a newly reviewed digest; the digest pin is for repeatable build inputs, not indefinite deferral of updates.

Example after selecting a verified host:

```sh
docker build --build-arg NEXT_PUBLIC_SITE_URL=https://your-verified-host -t savore-web:release-candidate .
```

The health endpoint returns only `{"status":"ok"}` or `{"status":"unavailable"}` and HTTP 200/503. It performs `SELECT 1`, uses `no-store`, and does not expose SQL errors, credentials, or host details. It is a readiness probe, not an authentication or application-flow test.

## Database integrity, migrations, and compatibility

The current local database reports all six checked-in Prisma migrations applied. The baseline migration enables `btree_gist` and installs `occupancy_no_overlap`, a GiST exclusion constraint over active dining-table time ranges. This database constraint remains the final protection against overlapping reservations. Later migrations add the persistent `AuthRateLimit` table, order/checkout constraints, floor ownership/waitlist indexes, QR session uniqueness and lookup indexes, and menu dietary labels. No Phase 12.4 database migration was added.

The repository has a documented historical schema-to-database drift in `docs/phase-12.3-hardening.md`, including timestamp/default differences, foreign-key/index naming and presence differences (including occupancy/waitlist lookup indexes). A read-only Prisma schema diff generated a 760-line prospective SQL script, including foreign-key and index changes. This is pre-existing drift because Phase 12.4 changes no Prisma model or migration; the script was inspected and never executed. `migrate status` only confirms migration history; it is not proof that every live object matches the Prisma schema. The Phase 12.4 review found the migration set current and the live exclusion constraint and extension present; no automatic drift repair, `db push`, reset, or destructive DDL was run. Reconcile drift only through a separately reviewed, backed-up migration plan.

Release procedure:

1. Take and verify a database backup before schema changes.
2. Review SQL for locking, table rewrites, extension privileges, constraints, and rollback/forward-fix implications against a production-sized staging copy.
3. Run `npx prisma migrate deploy` once as a release job using the target environment's secret, not concurrently from every app replica. Do not use `prisma db push` in deployed environments.
4. Deploy a compatible application revision, run readiness and customer/host/kitchen smoke flows, and observe migration/runtime logs.
5. Prefer expand-and-contract changes. Application rollback is safe only when the prior app remains compatible with the expanded schema. Otherwise roll forward with a reviewed corrective migration; never assume an automatic down migration is safe.

## Backup, restore, and recovery

### Verified local exercise

On 2026-10-29, a PostgreSQL custom-format backup of the local `savore_db` was written outside the Git repository to `../SAVORE_Phase12_4_Backups/savore_db_20261029.dump` (865,251 bytes). The archive passed `pg_restore --list`. Its containing directory has inheritance disabled and grants full access to the current Windows user and `SYSTEM`. It contains demo and integration data and must be treated as sensitive; keep it out of source control and do not send it in chat/email.

The archive was restored with `--no-owner --no-acl` into the new, isolated `savore_recovery_20261029` database on the same local PostgreSQL container. The source and restored counts matched for Restaurant (1), DiningTable (83), Reservation (706), MenuItem (3), Order (280), KitchenTicket (280), and WaitlistEntry (139). The restored database contains `btree_gist`, `occupancy_no_overlap`, and `AuthRateLimit`. The archive and recovery database were preserved. The same verified, unencrypted archive also remains at `/tmp/savore_db_20261029.dump` in the existing container's writable layer; it was not removed. Treat both copies as sensitive. The host copy is protected by a Windows ACL for the current account and `SYSTEM`, but no independent at-rest encryption was configured for this local exercise.

This demonstrates a logical restore, but it is **not disaster recovery**: source, archive, and restored database share one development host/container failure domain. The dump also captures demo and test data; its counts are not business acceptance metrics. No production backup policy, off-host backup, point-in-time recovery, or restore-time objective has been configured or verified.

### Runtime and regression use of the recovery copy (2026-10-29)

The Phase 12.4.1 container smoke tests and Phase 10.1–12.3 integration suites were directed to `savore_recovery_20261029`; no application write test was pointed at `savore_db`. The recovery copy was preserved. Read-only counts after those suites were Restaurant 1, DiningTable 85, Reservation 725, MenuItem 3, Order 287, KitchenTicket 287, and WaitlistEntry 142. These exceed the previously recorded restored-copy counts for tables, reservations, orders, kitchen tickets, and waitlist entries. The integration suites use run-scoped fixtures and report cleanup, but the aggregate counts show that test/demo records remain in this recovery copy. No cleanup or reset was performed. Treat the recovery database as a test-bearing copy, not a pristine restore; keep it and the archive until a separately reviewed retention action.

### Production policy to establish before launch

- Enable provider-managed encrypted snapshots and point-in-time recovery/WAL archiving to an account/region separate from the app. Keep an additional encrypted logical `pg_dump -Fc --no-owner --no-acl` export on a different storage failure domain.
- Define and approve RPO, RTO, retention, legal holds, data residency, encryption-key ownership, access logging, and restore authorization. Suggested initial review: daily logical export, continuous provider PITR, at least 30 daily restore points; this is a proposal, not an active schedule.
- Restrict backup reads to named operators and the restore role; encrypt at rest and in transit. Never log connection strings or include personal data in diagnostic output.
- Restore to a newly named isolated database/instance, never over the source. Verify migration level, extensions, exclusion constraints, critical table counts, application health, and representative customer/host/order workflows before cutover. Keep the source and archive until an explicitly approved retention process removes them.

### Operator commands (placeholders)

Use the platform's secret manager to set `DATABASE_URL`; avoid putting passwords in shell history or process arguments. For an interactive administrative shell, prefer a protected `PGPASSFILE` or secret manager integration. Resolve host/database/user from deployment configuration, and keep the password in the protected passfile. Example commands intentionally use placeholders and do not put a password-bearing URL in the process arguments:

```sh
pg_dump --host=PRIVATE_DB_HOST --username=APP_USER --dbname=APP_DB --format=custom --no-owner --no-acl --file=savore-backup.dump
pg_restore --list savore-backup.dump
createdb --host=PRIVATE_DB_HOST --username=RESTORE_USER savore_restore_check
pg_restore --exit-on-error --no-owner --no-acl --host=PRIVATE_DB_HOST --username=RESTORE_USER --dbname=savore_restore_check savore-backup.dump
```

Production recovery should use an isolated managed restore target and a second operator review. Do not automate deletion of backups or restored databases.

## Runtime operations

- **Readiness:** poll `/api/health`; 200 means the application can execute a database query, 503 means unavailable. Alert on sustained failures. Keep the probe internal where possible.
- **Liveness:** use the hosting platform's process/container check separately; `/api/health` is dependency-aware and should not be used as a pure process-liveness signal.
- **Migrations:** use the release-job sequence above; alert on failed migration exit and block rollout.
- **Logs:** Next.js writes to stdout/stderr. Current application error handlers generally return generic client messages and log server exceptions. No centralized structured logger, trace correlation, retention policy, alert routing, or log-redaction platform is configured. Before production, configure access-controlled log retention and review that SQL URLs, passwords, session/QR tokens, guest contact data, and payment details are excluded. Do not enable request-body logging for authentication, customer, QR, or payment routes.
- **Rate limits:** persistent counters live in PostgreSQL. Configure the trusted proxy header and block origin bypass before public exposure. Add alerting for database failures and unusual 429 volume without logging rate-limit secrets/tokens.
- **Security headers:** retain the existing headers and private/no-store API policy. Verify the selected ingress/CDN preserves them and does not cache authenticated responses. HSTS and full CSP rollout are deployment tasks as described above.
- **Restore/incident:** isolate the affected deployment, preserve logs and backups, identify the recovery point, restore to a fresh target, verify constraints and sample workflows, then use a reviewed cutover. Preserve the old database until incident and retention owners approve removal.
- **Rollback:** roll back the application only if it is schema-compatible; otherwise deploy a reviewed forward fix. Do not reset or restore over a live database as a routine rollback.

## Release checklist

- [ ] Select production host, region, domain, ingress, and managed PostgreSQL service.
- [ ] Create isolated production DB and least-privilege application/migration roles; configure network allowlists and verified TLS.
- [ ] Set the four runtime variables through a secret/config manager; test missing/invalid values fail with names only.
- [ ] Configure the trusted ingress to strip/overwrite the selected client-IP header; verify external spoof attempts and direct-origin denial in staging.
- [ ] Build with the verified canonical HTTPS URL and lockfile; scan image and dependencies; verify non-root runtime and exclusions.
- [ ] Configure backups, off-host retention, PITR, and complete an isolated restore on another failure domain; approve RPO/RTO.
- [ ] Run migrations once, then public/customer, host, kitchen, QR, and administrator smoke tests; verify exclusion constraint under concurrency.
- [ ] Validate HTTPS redirects/cert renewal before edge HSTS; run CSP report-only then staged enforcement.
- [ ] Configure monitoring, on-call ownership, log redaction/retention, database saturation alerts, and rollback communication.
- [ ] Complete human browser, keyboard, screen-reader, mobile, and accessibility acceptance. WCAG 2.2 AA is not currently verified.

## Unresolved risks

No public deployment or hosting configuration exists to inspect. The production proxy/header, TLS, HSTS, CDN caching, secret manager, backups/PITR, database TLS, alerting, log retention, and off-host restore remain unverified. CSP remains partial. Database drift is historical and documented, not reconciled. Browser/screen-reader acceptance and WCAG conformance remain pending. Payment handling is simulated; do not accept real payments on this release.

The Node 24 unit-test run emitted existing `MODULE_TYPELESS_PACKAGE_JSON` warnings for imported TypeScript files. One PostgreSQL `pg` client deprecation warning about overlapping `client.query()` calls appeared during shutdown after concurrent integration activity; it did not fail a check and was not reproduced by the normal page/health smoke requests. Investigate its call site before upgrading `pg` to v9. It is a follow-up reliability item, not evidence of a failed database restore or current HTTP check.
