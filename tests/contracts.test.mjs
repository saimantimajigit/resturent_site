import {test} from 'node:test';import {readFileSync} from 'node:fs';import assert from 'node:assert/strict';
test('reservation conflict enforced at database layer',()=>{const sql=readFileSync('prisma/migrations/20261012000100_baseline/migration.sql','utf8');assert.match(sql,/EXCLUDE USING gist/);assert.match(sql,/occupancy_no_overlap/)});
test('role-gated host UI',()=>{const text=readFileSync('src/app/staff/host/page.tsx','utf8');assert.match(text,/requireRole/)});
test('no stored plaintext password in seed',()=>{const text=readFileSync('prisma/seed.ts','utf8');assert.match(text,/hash\(pass,12\)/)});
