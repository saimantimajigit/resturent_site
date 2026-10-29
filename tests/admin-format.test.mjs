import {test} from 'node:test';
import assert from 'node:assert/strict';
import {csvCell,localDateTimeUtc,parseAdminRange} from '../src/server/admin-format.ts';

test('management date ranges use restaurant-local midnight and include the final day',()=>{
 const range=parseAdminRange('2026-10-28','2026-10-28','Asia/Kolkata');
 assert.equal(range.from.toISOString(),'2026-10-27T18:30:00.000Z');
 assert.equal(range.to.toISOString(),'2026-10-28T18:30:00.000Z');
});

test('management date boundaries honor daylight-saving changes',()=>{
 const range=parseAdminRange('2026-03-08','2026-03-08','America/New_York');
 assert.equal(range.to.getTime()-range.from.getTime(),23*60*60*1000);
});

test('management date filters reject invalid dates and oversized ranges',()=>{
 assert.throws(()=>parseAdminRange('2026-02-30','2026-02-30','Asia/Kolkata'),/calendar date/);
 assert.throws(()=>parseAdminRange('2025-01-01','2026-01-02','Asia/Kolkata'),/366 days/);
});

test('restaurant-local configuration date-times convert to UTC',()=>{
 assert.equal(localDateTimeUtc('2026-10-28T19:15','Asia/Kolkata').toISOString(),'2026-10-28T13:45:00.000Z');
 assert.throws(()=>localDateTimeUtc('2026-10-28T25:15','Asia/Kolkata'),/local time/);
});

test('restaurant-local configuration date-times account for daylight-saving transitions',()=>{
 assert.equal(localDateTimeUtc('2026-03-08T03:30','America/New_York').toISOString(),'2026-03-08T07:30:00.000Z');
 assert.throws(()=>localDateTimeUtc('2026-03-08T02:30','America/New_York'),/does not exist/);
});

test('CSV cells quote data and neutralize spreadsheet formulas',()=>{
 assert.equal(csvCell('=HYPERLINK("https://invalid")'),`"'=HYPERLINK(""https://invalid"")"`);
 assert.equal(csvCell('  +SUM(A1:A2)'),`"'  +SUM(A1:A2)"`);
 assert.equal(csvCell('ordinary, value'),`"ordinary, value"`);
});
