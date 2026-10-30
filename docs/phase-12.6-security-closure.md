# SAVORÉ Phase 12.6 security closure

Status: **Local credential rotation and role separation complete. Production infrastructure verification remains open.** The approved local work did not recreate or remove containers, volumes, or databases.

## Exposure and dependency assessment

A diagnostic in the preceding release review printed the value of the ignored repository `.env` database URL. Treat that password as compromised. The value is intentionally not reproduced here.

The bounded local environment scan found two files using the `savore` login on `localhost:5433`: the repository `.env` points to `savore_db`; `.env.client-demo` points to `savore_client_demo_2026_10_29_1`. Both are used by this SAVORÉ checkout. Phase integration suites also use this login through process-only overrides to reach `savore_recovery_20261029`. The local PostgreSQL catalog listed `postgres`, `savore_db`, `savore_client_demo_2026_10_29_1`, and `savore_recovery_20261029`, all owned by `savore`. No other matching env file was found in the scanned Downloads tree (601 filesystem entries within the scan bounds). The parent extracted project's `.env` points to a separate `postgres` login at `localhost:5432`; it was not included in this credential's consumer set. Docker listed one other stopped container, `expense-diary-db-1`, using port 5432 and its own `expense-diary_postgres_data` volume; it was not modified. No other active container besides PostgreSQL was listed. No separate application database sessions were active during the metadata check.

The active container is `savore-postgres-dev` (`postgres:17-alpine`), backed by `savore-postgres-dev-data`. Docker publishes port 5433 on `127.0.0.1` only. PostgreSQL listens on `*` inside the container and its `pg_hba.conf` permits SCRAM-authenticated host connections from all addresses reachable on the Docker network. This is not a public internet binding, but any process/container able to reach that network and obtain the credential could attempt a connection.

The `savore` database role has `LOGIN`, `SUPERUSER`, `CREATEDB`, and `CREATEROLE`. The container configuration also contains a `POSTGRES_PASSWORD` environment entry. This combination makes the exposed password a P0 local development risk even though the host port is bound to loopback.

Read-only checks found no current configured credential values in the non-secret worktree files or the 302 Git-history blobs reachable from local refs. A scan of the most recent 2,000 PostgreSQL container log lines found no matches for the currently configured DB, demo account, or QR secrets. The first attempt to capture container logs for an in-memory scan accidentally emitted SQL-only log lines into tool output; the subsequent PowerShell pipeline scanned the same tail and reported zero credential matches. These checks cannot remove or inspect the assistant conversation/tool transcript where the original value appeared. The QR demo token that was printed by a local development request logger was rotated; its replacement remains only in the ignored demo environment file.

## Phase 12.6.1 execution record

The owner authorized the non-destructive local rotation and role split. The `savore` password was changed after backups, role setup, and validation. Before rotation, the container's `POSTGRES_PASSWORD` value was confirmed to authenticate as `savore`; after rotation, that exact value failed with PostgreSQL SQLSTATE `28P01`. The replacement administrator credential is kept only in ACL-restricted ignored `.env.savore-admin`. A local-socket `docker exec ... psql` recovery connection was verified after rotation. The `savore` role remains a superuser for explicitly controlled local administration; it is not used by application runtime or migration commands.

Three custom-format, `--no-owner --no-acl` backups were written outside the nested Git repository under `SAVORE_Phase12_4_Backups/phase1261_20261029_185405`: `savore_db.dump` (889,508 bytes), `savore_client_demo_2026_10_29_1.dump` (154,654 bytes), and `savore_recovery_20261029.dump` (896,173 bytes). Each passed `pg_restore --list` with 369 archive entries. The directory inherits an ACL granting access only to the current Windows account and `SYSTEM`. These archives share the development host's failure domain and are not encrypted at rest.

The preflight confirmed the existing three SAVORÉ databases each contained 64 Prisma-managed tables, 14 enums, one application trigger function, six applied migrations, and the validated `occupancy_no_overlap` exclusion constraint. The `btree_gist` extension was installed and remains owned by `savore`; extension ownership was not transferred. The `public` schema owner remains `pg_database_owner`. The migration login now owns only the reviewed Prisma-managed tables, enum types, and application trigger function in the three SAVORÉ databases. No database ownership was reassigned.

`savore_app` has `LOGIN` only, with no superuser, database/role creation, replication, bypass-RLS, temporary-table, or public-schema CREATE privilege. It has explicit database CONNECT, schema USAGE, CRUD on existing tables, and sequence usage/select/update (there are currently no application sequences). Default privileges grant the same application DML on objects created by `savore_migrator`. `savore_migrator` has `LOGIN` only with no superuser, database/role creation, replication, or bypass-RLS. It can CONNECT to the three SAVORÉ databases and CREATE in `public`, and owns the reviewed migration-managed objects. `PUBLIC` CONNECT/TEMP on the three SAVORÉ databases and the PostgreSQL maintenance database, plus `PUBLIC` CREATE on the SAVORÉ `public` schemas, were revoked; preflight found no other existing login role that depended on these privileges. Post-rotation checks confirmed neither restricted role can connect to `postgres`, while the local superuser recovery connection remains available.

Prisma CLI migration commands now require `MIGRATION_DATABASE_URL`, loaded from ignored `.env.migrations` for local work. Next.js uses `DATABASE_URL` only. Demo startup launchers explicitly strip migration/admin URLs; `demo:prepare` uses the protected administrator connection only for database creation and extension bootstrap, the migration role for schema changes, and the runtime role for seed writes. All four ignored environment files have restrictive ACLs: `.env`, `.env.migrations`, and `.env.savore-admin` allow the current account, `SYSTEM`, and Administrators; `.env.client-demo` allows the current account and `SYSTEM`. The local `.env` no longer contains `POSTGRES_*` initialization variables.

The existing container was intentionally not recreated. Its Docker configuration still stores the old `POSTGRES_PASSWORD` initialization value, but that value no longer authenticates to PostgreSQL. Docker initialization variables do not update a role in an already-initialized data volume. Removing that stale metadata requires a separately authorized container replacement; until then, do not treat it as a valid credential or use it to initialize another database. Safe future cleanup requires a maintenance window and fresh verified backups, stopping the current container, and creating a replacement that mounts the existing named volume with the rotated initialization value. Never run two PostgreSQL processes against that volume at once. Validate the replacement on loopback before switching applications; keep the previous container stopped for rollback until acceptance. Removing the old container, which still retains the stale value in its metadata, requires separate explicit approval.

Final validation completed: Prisma validation, Client generation, and TypeScript checks passed; `migrate status` and no-op `migrate deploy` passed for all three SAVORÉ databases, each with six migrations up to date. The demo preparation/migration/seed passed, and `demo:verify` passed 16/16 after QR rotation. Unit tests passed 38/38. Development integration suites passed: Phase 10.1 12, 11.1 12, 11.2 17 plus one conditional skip, 11.3 20, 11.4 12, 12.1 5, and 12.3 7 (85 passed, one skipped). Production integration suites passed: Phase 10.1 12, 11.3 20, and 12.3 7. The production build passed, and `npm audit` reported zero vulnerabilities.

The client-demo development HTTP smoke suite passed 32/32 before the QR log exposure. After token replacement, the production demo smoke suite passed 30/32. Its two QR claim/menu assertions could not complete because the existing T03 demo occupancy interval had expired; the fixture was preserved. The production Phase 11.3 integration suite then passed all 20 assertions using its isolated active-seating fixture, including real QR flows. This is a stale demo-fixture limitation, not an application QR regression.

During local HTTP smoke testing, one T03 guest QR URL appeared in a development server access log. The value is not reproduced here; the token was immediately revoked and replaced using the existing rotation script. Subsequent checks confirmed the replacement token is active. Avoid returning raw development-server access logs in future QA output.

The production client-demo smoke run was not a visual browser review. Desktop/mobile visual, keyboard-only, and screen-reader acceptance remain pending; see [visual acceptance](phase-12.6-visual-acceptance.md).

## Future diagnostic handling

- Never print, `rg`, or `Get-Content` raw `.env` files or Docker environment values. Read variable names and sanitized URL fields only.
- Do not place connection strings, passwords, session secrets, or QR tokens in shell arguments, logs, reports, screenshots, or Git.
- Scan logs in a pipeline that outputs only a match count or redacted location; do not print raw PostgreSQL logs.
- Keep `.env*` ignored except checked-in examples. Verify staged filenames and staged diff before any GitHub upload.

## Local backup and restore procedure

Use an ACL-restricted folder outside the repository. With the current PostgreSQL container's local socket trust, a custom-format dump can be made without putting a password in a command:

```powershell
$backupDir = Join-Path $env:USERPROFILE 'SAVORE-private-backups'
New-Item -ItemType Directory -Force -Path $backupDir | Out-Null
icacls $backupDir /inheritance:r /grant:r "$env:USERDOMAIN\$env:USERNAME`:(OI)(CI)F" 'NT AUTHORITY\SYSTEM:(OI)(CI)F'
docker exec savore-postgres-dev pg_dump -U savore -Fc savore_db > (Join-Path $backupDir 'savore_db.dump')
docker exec savore-postgres-dev pg_dump -U savore -Fc savore_client_demo_2026_10_29_1 > (Join-Path $backupDir 'savore_client_demo.dump')
docker cp (Join-Path $backupDir 'savore_db.dump') savore-postgres-dev:/tmp/savore_db.dump
docker exec savore-postgres-dev pg_restore --list /tmp/savore_db.dump
```

Repeat the `docker cp` and `pg_restore --list` check for the demo archive before any maintenance. Do not restore to an existing database. For recovery, create a new uniquely named database, copy the archive into the container, and run `pg_restore -U savore --dbname=<new_database> /tmp/<archive-name>`; verify migrations, constraints, and fixture counts before directing an application to it. Store backups and environment files under Windows ACLs; do not include them in support bundles or Git. The container copy is a temporary inspection/recovery file; use a new unique filename for each archive.

## Current acceptance state

- Secret in source/current Git history: **not found** for configured current secret values.
- Recent PostgreSQL logs: **no current configured secret value matches** in the scanned tail.
- Original transcript exposure: **confirmed**; transcript cannot be scrubbed by this repository change.
- Password invalidation: **completed** for the old local `savore` superuser password; it is rejected by new connections. The stale value remains in existing container initialization metadata as documented below.
- Public production: **not ready**. See [the handover](phase-12.6-handover.md) for the remaining operational requirements.

## Phase 12.6.2 verification correction

The earlier “Current acceptance state” bullets above reflect the status before the authorized Phase 12.6.1 credential rotation and are superseded by this section. The old local `savore` superuser password was rotated after protected backups and was confirmed rejected on a new PostgreSQL connection (authentication SQLSTATE `28P01`). The current runtime role is `savore_app`; the migration role is `savore_migrator`; the protected administrator connection remains separate and is not passed to Next.js. `savore_app` has no superuser, role/database creation, replication, bypass-RLS, temporary-table, or schema-creation privilege; it has database CONNECT only to the three SAVORÉ databases, schema USAGE, and runtime DML. `savore_migrator` is also not a superuser and is limited to those SAVORÉ databases with schema CREATE/object ownership needed for reviewed Prisma migrations. The three existing databases and the verified backup archives were preserved.

The old initialization-time password remains in the existing container's Docker metadata even though it is rejected by PostgreSQL. This is an environment cleanup task requiring a separately authorized maintenance window and container replacement that reuses the existing volume; no replacement or backup deletion occurred here. Do not copy the stale value into any new container or credential store.

The checked-in handover and Phase 12.4 readiness instructions require explicit HTTPS and reverse-proxy verification before deployment. The current CSP is partial (`base-uri 'self'`, `object-src 'none'`, `frame-ancestors 'none'`); it does not restrict default/script/style/image/font/connect/form sources. A real deployment must first run a report-only policy, review violations across all application areas, then enforce a tested nonce/hash and explicit-source policy with a rollback plan. HSTS remains disabled until the production hostname, TLS, redirects, subdomains and certificate renewal are verified. No production proxy configuration was assumed or tested.

Source review and the locally executed functional/accessibility checks do not establish WCAG 2.2 AA. Manual browser visual review, keyboard-only navigation and screen-reader announcements remain pending at 390px, 768px and 1440px. Exact parity with the full approved screen reference is also unverified.

For the 2026-10-29 handover, the old container-metadata password rejection check returned SQLSTATE `28P01`; role checks passed for separate `savore_app` and `savore_migrator` logins and the app role had no schema CREATE privilege. A no-output scan found zero matches for 18 configured secret values across 196 current non-ignored files, 601 reachable Git objects, and the latest 2,000 PostgreSQL log lines. The old value is still present in existing container initialization metadata and must be removed only through a separately authorized maintenance plan; no container replacement or backup deletion was performed here.
