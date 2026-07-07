import { readSession } from '../../../lib/session';
import { getStats, kvEnabled, jstDate } from '../../../lib/analytics';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function fmtJst(ts) {
  if (!ts) return '';
  return new Date(Number(ts)).toLocaleString('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// CSV セル用エスケープ
function cell(v) {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(header, rows) {
  return [header, ...rows].map((r) => r.map(cell).join(',')).join('\r\n');
}

export async function GET(req) {
  // /api/* は middleware を通らないため、ここで認証・認可を行う
  const token = req.cookies.get('lw_session')?.value;
  const session = token ? await readSession(token) : null;
  if (!session) {
    return new Response('Unauthorized', { status: 401 });
  }

  const admins = (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (admins.length && !admins.includes(String(session.email || '').toLowerCase())) {
    return new Response('Forbidden', { status: 403 });
  }

  if (!kvEnabled()) {
    return new Response('Vercel KV (analytics store) is not configured.', {
      status: 503,
    });
  }

  const stats = await getStats({ eventsLimit: 2000 });
  const type = req.nextUrl.searchParams.get('type') || 'users';
  const format = req.nextUrl.searchParams.get('format') || 'csv';

  if (format === 'json') {
    return Response.json(stats);
  }

  let csv;
  if (type === 'events') {
    csv = toCsv(
      ['日時(JST)', 'メール', '名前', 'パス', 'ユーザーエージェント'],
      stats.recent.map((e) => [fmtJst(e.ts), e.email, e.name, e.path, e.ua])
    );
  } else {
    csv = toCsv(
      ['メール', '名前', '閲覧回数', '初回閲覧(JST)', '最終閲覧(JST)'],
      [...stats.users]
        .sort((a, b) => b.count - a.count)
        .map((u) => [u.email, u.name, u.count, fmtJst(u.firstSeen), fmtJst(u.lastSeen)])
    );
  }

  // Excel で文字化けしないよう BOM を付与
  return new Response('﻿' + csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="access-${type}-${jstDate()}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}
