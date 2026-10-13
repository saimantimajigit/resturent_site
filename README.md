# SAVORÉ Phase 9.2 — Offline Runtime-Gate Audit and Patch

This is the **complete copied Phase 9.1 source** with Phase 9.2 repairs, not a claim of completed runtime validation.

## Repairs in this patch
- Booking confirmation no longer displays an undefined table number.
- Staff status API now throws typed authentication/authorization errors and responds with HTTP 401/403 rather than redirecting as if it were a page.
- Zod status validation responds with HTTP 400. Unexpected status failures respond HTTP 500, not HTTP 409.
- Added offline automated contract tests for these behaviors and model/table name agreement.

## Verified (environment used to package)
See `VALIDATION_REPORT.md` for the exact commands and results.

## Blocking checks — required before any client demo
1. Install dependencies with network access: `npm install` and commit a lockfile.
2. Verify Prisma 7 schema/adapter compatibility: `npx prisma validate` and `npx prisma generate`.
3. Use **disposable PostgreSQL** and review baseline SQL before `npx prisma migrate deploy`. Verify `btree_gist` extension privileges.
4. Run `npx tsc --noEmit`, `npm run build`, `npm run db:seed`.
5. Run a PostgreSQL concurrency integration test with two simultaneous requests against the same available table; verify only one succeeds, then validate release after completion/cancellation.
6. Run a browser-based login, booking, host check-in, seating and completion journey.
7. Implement public booking rate limiting and idempotency and full session/CSRF hardening before external exposure.

## Tests executable without installing dependencies
```bash
npm test
python3 scripts/check_contracts.py
python3 scripts/check_phase92.py
```

Environment: copy `.env.example` to `.env` and configure disposable PostgreSQL and a strong demo staff password. See Phase 9.1 documentation for original features and limitations.
