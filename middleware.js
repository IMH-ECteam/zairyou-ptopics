import { NextResponse } from 'next/server';
import { readSession } from './lib/session';
import { recordView } from './lib/analytics';

// 守る対象のパス（/api/* と /denied は素通り＝ログイン処理用）
// /admin はアクセス解析ダッシュボード（社員＋任意で管理者メールに限定）
export const config = {
  matcher: ['/', '/topics.html', '/admin', '/admin/:path*'],
};

export async function middleware(req, event) {
  const { pathname } = req.nextUrl;
  const token = req.cookies.get('lw_session')?.value;
  const session = token ? await readSession(token) : null;

  // 有効なセッションが無ければ LINE WORKS ログインへ
  if (!session) {
    const url = req.nextUrl.clone();
    url.pathname = '/api/login';
    url.search = '';
    return NextResponse.redirect(url);
  }

  // /admin は ADMIN_EMAILS を設定した場合のみ、その社員だけに絞る
  if (pathname === '/admin' || pathname.startsWith('/admin/')) {
    const admins = (process.env.ADMIN_EMAILS || '')
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    const email = String(session.email || '').toLowerCase();
    if (admins.length && !admins.includes(email)) {
      const url = req.nextUrl.clone();
      url.pathname = '/denied';
      url.search = '';
      return NextResponse.redirect(url);
    }
  }

  // トピックス閲覧を1ビューとして記録（"/" は /topics.html へ転送されるため二重計上しない）。
  // waitUntil でレスポンスをブロックせずに非同期記録する。
  if (pathname === '/topics.html' && event?.waitUntil) {
    event.waitUntil(
      recordView({
        sub: session.sub,
        email: session.email || null,
        name: session.name || null,
        path: pathname,
        ua: req.headers.get('user-agent') || '',
      })
    );
  }

  return NextResponse.next();
}
