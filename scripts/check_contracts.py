from pathlib import Path
import json,re,unittest
ROOT=Path(__file__).resolve().parents[1]
class Contracts(unittest.TestCase):
 def test_model_count(self):
  s=(ROOT/'prisma/schema.prisma').read_text(); self.assertEqual(len(re.findall(r'^model ',s,re.M)),59)
 def test_relations(self):
  s=(ROOT/'prisma/schema.prisma').read_text(); self.assertIn('@relation(',s);self.assertIn('model TableOccupancy',s)
 def test_exclusion(self):
  s=(ROOT/'prisma/migrations/20261012000100_baseline/migration.sql').read_text();self.assertIn('EXCLUDE USING gist',s);self.assertIn('tstzrange(',s)
 def test_api(self):
  d=json.loads((ROOT/'openapi/openapi.json').read_text());self.assertEqual(d['openapi'],'3.1.0');self.assertIn('paths',d)
 def test_reservation_endpoint(self):
  s=(ROOT/'src/app/api/v1/reservations/route.ts').read_text();self.assertIn('createBooking',s);self.assertIn('BookingConflict',s)
 def test_environment(self):
  s=(ROOT/'.env.example').read_text();self.assertIn('DEMO_HOST_PASSWORD',s)
if __name__=='__main__':unittest.main()
