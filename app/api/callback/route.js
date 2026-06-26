import { NextResponse } from 'next/server';
import { createSession } from '../../../lib/session';

// id_token のペイロード部だけを取り出す（署名はTLS経由のバックチャネル取得で担保）
function decodeJwtPayload(jwt) {
  const part = jwt.split('.')[1];
  const json = atob(part.replace(/-/g, '+').replace(/_/g, '/'));
  return JSON.parse(json);
}

export async function GET(req) {
  const code = req.nextUrl.searchParams.get('code');
  const state = req.nextUrl.searchParams.get('state');
  const savedState = req.cookies.get('lw_state')?.value;

  // state 不一致 / code なしは弾く
  if (!code || !state || state !== savedState) {
    return NextResponse.redirect(new URL('/api/login', req.url));
  }

  // 認可コードをトークンに交換（client_secret はサーバー内だけで使用）
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    client_id: process.env.LW_CLIENT_ID,
    client_secret: process.env.LW_CLIENT_SECRET,
    redirect_uri: process.env.LW_REDIRECT_URI,
  });

  const tokenRes = await fetch(
    'https://auth.worksmobile.com/oauth2/v2.0/token',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    }
  );

  if (!tokenRes.ok) {
    return NextResponse.redirect(new URL('/denied', req.url));
  }

  const tokens = await tokenRes.json();
  const claims = decodeJwtPayload(tokens.id_token);

  // ── 任意: 特定ドメイン/組織だけに絞りたい場合はコメント解除 ──
  // const allowed = (process.env.ALLOWED_DOMAINS || '')
  //   .split(',')
  //   .map((d) => d.trim())
  //   .filter(Boolean);
  // const email = String(claims.email || '');
  // if (allowed.length && !allowed.some((d) => email.endsWith(d))) {
  //   return NextResponse.redirect(new URL('/denied', req.url));
  // }

  // 自社セッションCookieを発行
  const session = await createSession({
    sub: claims.sub,
    email: claims.email || null,
    name: claims.name || null,
  });

  const res = NextResponse.redirect(new URL('/topics.html', req.url));
  res.cookies.set('lw_session', session, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: 60 * 60 * 8, // 8時間
    path: '/',
  });
  res.cookies.delete('lw_state');
  return res;
}
