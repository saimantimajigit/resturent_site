# Phase 9.2 Validation Report

## Executed locally

Command: `npm test && python3 scripts/check_contracts.py && python3 scripts/check_phase92.py`

Exit code: 0

```text

> savore-connected-demo@0.1.0 test
> node --experimental-strip-types --test tests/*.test.mjs

TAP version 13
# (node:2199) ExperimentalWarning: Type Stripping is an experimental feature and might change at any time
# (Use `node --trace-warnings ...` to show where the warning was created)
# (node:2199) [MODULE_TYPELESS_PACKAGE_JSON] Warning: Module type of file:///mnt/data/SAVORE_Phase9_2/src/server/booking-policy.ts is not specified and it doesn't parse as CommonJS.
# Reparsing as ES module because module syntax was detected. This incurs a performance overhead.
# To eliminate this warning, add "type": "module" to /mnt/data/SAVORE_Phase9_2/package.json.
# Subtest: accepts booking during configured dinner service
ok 1 - accepts booking during configured dinner service
  ---
  duration_ms: 1.105282
  type: 'test'
  ...
# Subtest: rejects booking outside service
ok 2 - rejects booking outside service
  ---
  duration_ms: 0.720891
  type: 'test'
  ...
# Subtest: rejects party beyond capacity policy
ok 3 - rejects party beyond capacity policy
  ---
  duration_ms: 0.117665
  type: 'test'
  ...
# Subtest: rejects blocked interval
ok 4 - rejects blocked interval
  ---
  duration_ms: 0.158185
  type: 'test'
  ...
# Subtest: rejects expired cutoff
ok 5 - rejects expired cutoff
  ---
  duration_ms: 0.130724
  type: 'test'
  ...
# Subtest: rejects invalid calendar date
ok 6 - rejects invalid calendar date
  ---
  duration_ms: 0.112677
  type: 'test'
  ...
# Subtest: permits check-in then seating
ok 7 - permits check-in then seating
  ---
  duration_ms: 0.216762
  type: 'test'
  ...
# Subtest: forbids invalid transitions
ok 8 - forbids invalid transitions
  ---
  duration_ms: 0.100209
  type: 'test'
  ...
# Subtest: reservation conflict enforced at database layer
ok 9 - reservation conflict enforced at database layer
  ---
  duration_ms: 0.824866
  type: 'test'
  ...
# Subtest: role-gated host UI
ok 10 - role-gated host UI
  ---
  duration_ms: 0.192286
  type: 'test'
  ...
# Subtest: no stored plaintext password in seed
ok 11 - no stored plaintext password in seed
  ---
  duration_ms: 0.829563
  type: 'test'
  ...
# Subtest: booking confirmation does not falsely claim table number
ok 12 - booking confirmation does not falsely claim table number
  ---
  duration_ms: 0.687963
  type: 'test'
  ...
# Subtest: host actions call non-redirecting authorization
ok 13 - host actions call non-redirecting authorization
  ---
  duration_ms: 0.156613
  type: 'test'
  ...
# Subtest: status route sends explicit HTTP 401 and 403
ok 14 - status route sends explicit HTTP 401 and 403
  ---
  duration_ms: 0.16127
  type: 'test'
  ...
# Subtest: reservation engine uses serializable transaction and table lock
ok 15 - reservation engine uses serializable transaction and table lock
  ---
  duration_ms: 0.293706
  type: 'test'
  ...
1..15
# tests 15
# suites 0
# pass 15
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 108.861768
PASS: 59 Prisma model names correspond to SQL tables
PASS: baseline contains occupancy exclusion and check constraints

......
----------------------------------------------------------------------
Ran 6 tests in 0.001s

OK

```

## Not executed / blocked
- `npm install`: attempted, exceeded environment timeout.
- Prisma validation / code generation: unavailable without dependencies.
- PostgreSQL migrations / live concurrency: no postgres, psql, or Docker installed.
- TypeScript, Next.js build, and Playwright: unavailable without installed dependencies.

Do not treat offline checks as proof that the app runs.
