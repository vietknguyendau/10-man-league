import { NextResponse } from 'next/server';
import { redis, RESULTS_KEY } from '../../../lib/redis';

export async function GET() {
  try {
    const value = await redis.get(RESULTS_KEY);
    const results = value ? (typeof value === 'string' ? JSON.parse(value) : value) : {};
    return NextResponse.json({ results });
  } catch (e) {
    return NextResponse.json({ results: {}, error: String(e?.message || e) }, { status: 200 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const results = body?.results;
    if (!results || typeof results !== 'object') {
      return NextResponse.json({ error: 'Missing results' }, { status: 400 });
    }
    await redis.set(RESULTS_KEY, JSON.stringify(results));
    return NextResponse.json({ results });
  } catch (e) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}
