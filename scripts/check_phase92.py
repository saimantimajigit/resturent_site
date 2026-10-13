from pathlib import Path
import re
schema=Path('prisma/schema.prisma').read_text()
sql=Path('prisma/migrations/20261012000100_baseline/migration.sql').read_text()
models=set(re.findall(r'^model\s+(\w+)\s*\{',schema,re.M))
tables=set(re.findall(r'CREATE TABLE "(\w+)"',sql))
assert models==tables, f'Model/table drift: missing in SQL {models-tables}, extra in SQL {tables-models}'
assert 'CREATE EXTENSION IF NOT EXISTS btree_gist' in sql
assert 'EXCLUDE USING gist' in sql and 'tstzrange(' in sql
assert 'WHERE ("active" = TRUE)' in sql
assert 'occupancy_times_check' in sql and 'reservation_times_check' in sql
print(f'PASS: {len(models)} Prisma model names correspond to SQL tables')
print('PASS: baseline contains occupancy exclusion and check constraints')
