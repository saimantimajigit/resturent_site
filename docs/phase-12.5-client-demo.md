# SAVORÉ Phase 12.5 client demo

## Scope and readiness

This is a local, fictional client-demo environment. It uses a new PostgreSQL database named `savore_client_demo_*`, separate from `savore_db` and `savore_recovery_*`. The setup command refuses a non-local connection, never resets a database, and only creates a database after confirming its exact prefixed name is unused. If setup is interrupted, it leaves the database and ignored secret file in place for review or recovery.

The seed is repeatable and idempotent for its named accounts and fixtures. It does not delete records. It creates six role accounts, a published menu, a next-day customer reservation, a current seated table and QR session, a waiting guest, and a dine-in order with a kitchen ticket. The QR credential is generated locally; only its SHA-256 hash is stored in PostgreSQL. The seeded account passwords and QR token are generated into the ignored `.env.client-demo` file and never printed by setup.

No design source or approved client reference was provided with the Phase 12.5 brief. The SAVORÉ forest-green, ivory, and antique-gold direction is retained from the application, but pixel-parity acceptance remains pending review against the client's actual references.

## Local setup and operation

Prerequisites: Node.js/npm dependencies installed; the local PostgreSQL 17 container is running on `127.0.0.1:5433`; the existing ignored `.env` contains a local `DATABASE_URL` with a database role permitted to create databases; and the repository's normal Prisma engine access works.

Run from the repository root:

```powershell
npm.cmd run demo:prepare
npm.cmd run demo:start
```

`demo:prepare` reads `.env` without printing it, selects the next unused date-stamped `savore_client_demo_*` name, writes role secrets into ignored `.env.client-demo`, applies checked-in migrations using `prisma migrate deploy`, generates Prisma Client, and runs the Phase 12.5 seed. It does not call `db push`, reset, truncate, or drop. `demo:start` runs Next.js on `http://127.0.0.1:3015`, with a distinct `.next-dev-phase125` output directory and the demo database settings loaded only into that process.

For a later fresh demo state, preserve the existing database and its secret file. Move the ignored `.env.client-demo` file to a clearly named ignored archive such as `.env.client-demo-20261029-1500`, then run `npm.cmd run demo:prepare`. The setup selects a new unused database and creates new credentials. Do not delete a database or old secret archive as part of a demo refresh. Re-running with the active `.env.client-demo` reuses only the database marked `phase-12.5-client-demo`; the seed adds/updates its named fixtures and keeps operationally changed order state.

Stop the demo server with Ctrl+C. Existing production/recovery databases and PostgreSQL volumes are not part of the demo lifecycle. Never put `.env.client-demo` into a screenshot, recording, support bundle, Git commit, or presentation deck. Reveal credentials only to the person operating the local demo, using their approved password manager or local secure access process.

For a local production-mode preview, first complete `npm.cmd run build`, then run `npm.cmd run demo:start:prod` in a separate terminal. It listens only on `127.0.0.1:3016` and still uses the isolated demo database. Use the canonical local origin for same-origin requests: in another PowerShell window run `$env:SAVORE_DEMO_BASE_URL='http://localhost:3016'; npm.cmd run demo:smoke`. The development server uses port 3015 and `.next-dev-phase125`; production uses port 3016 and `.next-prod`.

## Fictional account and permission matrix

All accounts use `@savore.example.test`; these are fictional local accounts. The generated password for each account is in the ignored local secret file. This document intentionally contains no passwords.

| Role | Login | Demonstration permissions |
|---|---|---|
| Customer | `customer.demo@savore.example.test` | Own profile, favorites, reservations, ordering, and order tracking. |
| Host | `host.demo@savore.example.test` | Reservation, walk-in, waitlist, check-in, floor and table operations. |
| Waiter | `waiter.demo@savore.example.test` | Assigned service tables, assistance, and guest service status. |
| Chef | `chef.demo@savore.example.test` | Kitchen ticket queue and permitted kitchen status changes. |
| Manager | `manager.demo@savore.example.test` | Restaurant operations and reporting within the demo restaurant. |
| Owner | `owner.demo@savore.example.test` | Administrative access within the demo restaurant. |

The app's role authorization remains enforced server-side. This fixture sets one restaurant membership for each staff account and does not grant customer accounts staff memberships.

## Suggested connected presentation script (15–20 minutes)

1. Open the public site and menu as a guest. Point out fictional pricing and dietary labels.
2. Sign in as the customer. View the seeded next-day reservation, update the customer profile or favorite a dish, then create a new reservation to demonstrate the live customer-to-host path.
3. Sign in as host. Find the customer reservation, check it in, assign a suitable table, and show the calendar and floor occupancy. Add a walk-in or move the seeded waitlist guest through a permitted state.
4. Sign in as waiter. Open the assigned service board and show the occupied T03 service session.
5. Scan/open the QR for T03 using the raw token in `.env.client-demo` without copying it into slides or chat. Show the guest menu and place a fictional dine-in order.
6. Sign in as chef. Show the order's ticket and advance its kitchen state through the allowed workflow.
7. Return to waiter/customer view and show the updated service/tracking state. Close with manager/owner reporting and the simulated-revenue label.

QR path: `/qr/<DEMO_QR_T03_TOKEN>`. The token is intentionally not included in this guide. Payment records and revenue examples are simulated; do not present this system as accepting real payments.

## Recovery and troubleshooting

- If port 3015 is already occupied, do not stop an unknown process. Review `scripts/run-client-demo.mjs` and select an unused loopback port consistently; keep the browser origin on `127.0.0.1`.
- If setup fails before database creation, inspect the local PostgreSQL service and `.env` configuration without copying credentials into a terminal transcript.
- If migrations or seeding fail after database creation, preserve both the demo database and `.env.client-demo`. Review the error and rerun `npm run demo:prepare` only after confirming the target marker and connection.
- If the demo database exists but lacks the Phase 12.5 marker, setup intentionally stops. Inspect it read-only; do not reset or adopt it automatically.
- The local database, backup, and generated secrets share a development machine failure domain. This setup is not production, disaster recovery, payment processing, or a multi-tenant security certification.

## Acceptance and limitations

See [Phase 12.5 visual acceptance](phase-12.5-visual-acceptance.md) for the executable viewport checklist. Real-browser visual acceptance is pending until a working browser is used at 390px, 768px, and 1440px. Manual keyboard-only and screen-reader evaluation is also pending. The current local environment has no approved client reference screenshots, so design parity has not been certified. No production domain, HTTPS ingress, trusted proxy, payment provider, analytics/privacy consent review, or deployment has been selected or verified.
