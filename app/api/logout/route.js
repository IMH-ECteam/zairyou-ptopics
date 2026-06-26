import { NextResponse } from 'next/server';

export async function GET(req) {
  const res = NextResponse.redirect(new URL('/api/login', req.url));
  res.cookies.delete('lw_session');
  return res;
}
