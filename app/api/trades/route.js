import { NextResponse } from 'next/server';
import { redis } from '../../../lib/redis';

const TRADES_KEY = 'nfl10man:trades';

export async function GET() {
  try {
    const value = await redis.get(TRADES_KEY);
    const trades = value ? (typeof value === 'string' ? JSON.parse(value) : value) : [];
    return NextResponse.json({ trades });
  } catch (e) {
    return NextResponse.json({ trades: [], error: String(e?.message || e) }, { status: 200 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const trades = body?.trades;
    if (!Array.isArray(trades)) {
      return NextResponse.json({ error: 'Missing trades array' }, { status: 400 });
    }
    await redis.set(TRADES_KEY, JSON.stringify(trades));
    return NextResponse.json({ trades });
  } catch (e) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}
