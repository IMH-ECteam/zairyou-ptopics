import { NextResponse } from 'next/server';

// LINE WORKS の認可画面へ送り出す
export async function GET() {
  const state = crypto.randomUUID(); // CSRF対策のワンタイム値

  const params = new URLSearchParams({
    client_id: process.env.LW_CLIENT_ID,
    redirect_uri: process.env.LW_REDIRECT_URI,
    response_type: 'code',
    scope: 'openid email profile',
    state,
  });

  const authUrl =
    'https://auth.worksmobile.com/oauth2/v2.0/authorize?' + params.toString();

  const res = NextResponse.redirect(authUrl);
  // state を検証用に一時保存（10分）
  res.cookies.set('lw_state', state, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: 600,
    path: '/',
  });
  return res;
}
