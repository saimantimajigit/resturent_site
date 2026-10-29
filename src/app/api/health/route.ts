import { db } from '@/server/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await db.$queryRaw`SELECT 1`;
    return Response.json({ status: 'ok' }, { headers: { 'Cache-Control': 'private, no-store, max-age=0' } });
  } catch {
    // Keep database, network, and credential details out of public health responses.
    return Response.json({ status: 'unavailable' }, { status: 503, headers: { 'Cache-Control': 'private, no-store, max-age=0' } });
  }
}
