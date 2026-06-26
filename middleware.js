import { NextResponse } from 'next/server';
import { verifySession } from './lib/session';

// 守る対象のパスだけを指定（/api/* と /denied は素通り＝ログイン処理用）
export const config = {
  matcher: ['/', '/topics.html'],
};

export async function middleware(req) {
  const token = req.cookies.get('lw_session')?.value;

  // 有効なセッションがあれば通す
  if (token && (await verifySession(token))) {
    return NextResponse.next();
  }

  // なければ LINE WORKS ログインへ
  const url = req.nextUrl.clone();
  url.pathname = '/api/login';
  url.search = '';
  return NextResponse.redirect(url);
}
