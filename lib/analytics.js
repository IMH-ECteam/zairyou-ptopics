// アクセス解析のストレージ層。
// Vercel KV(Upstash Redis) の REST API を fetch で直接叩くため、追加ライブラリは不要。
// KV 未設定でもアプリは動作し、その場合は Vercel のランタイムログへ JSON を出力する。

const KV_URL = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;

// Redis キー定義
const KEYS = {
  count: 'analytics:count', // Hash: userId -> 累計閲覧回数
  meta: 'analytics:meta', // Hash: userId -> JSON{email,name,lastSeen,lastPath}
  first: 'analytics:first', // Hash: userId -> 初回閲覧のタイムスタンプ
  events: 'analytics:events', // List: 直近アクセスの生ログ(JSON)
  daily: 'analytics:daily', // Hash: YYYY-MM-DD(JST) -> その日の閲覧数
};
const EVENTS_CAP = 2000; // 生ログの保持上限（古いものから破棄）

// Vercel KV が設定済みか
export function kvEnabled() {
  return Boolean(KV_URL && KV_TOKEN);
}

// JST の YYYY-MM-DD 文字列
export function jstDate(d = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

// Upstash Redis REST のパイプライン実行。commands は [["HINCRBY", key, field, 1], ...]
async function kvPipeline(commands) {
  const res = await fetch(`${KV_URL}/pipeline`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${KV_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(commands),
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error(`KV pipeline failed: ${res.status} ${await res.text()}`);
  }
  const data = await res.json(); // [{result: ...}, {error: ...}, ...]
  return data.map((x) => x.result);
}

// HGETALL の戻り値を { field: value } に正規化（配列形式・オブジェクト形式の両対応）
function hgetallToObj(v) {
  if (!v) return {};
  if (Array.isArray(v)) {
    const o = {};
    for (let i = 0; i < v.length; i += 2) o[v[i]] = v[i + 1];
    return o;
  }
  return v;
}

// 1回の認証済み閲覧を記録する。middleware から event.waitUntil() 経由で呼ぶ想定。
export async function recordView(evt) {
  const ts = Date.now();
  const id = evt.sub || evt.email || 'unknown';
  const record = {
    id,
    email: evt.email || null,
    name: evt.name || null,
    path: evt.path || null,
    ua: (evt.ua || '').slice(0, 300),
    ts,
  };

  // KV 未設定時は Vercel ランタイムログへフォールバック
  if (!kvEnabled()) {
    console.log('[access-log]', JSON.stringify(record));
    return;
  }

  try {
    const day = jstDate(new Date(ts));
    await kvPipeline([
      ['HINCRBY', KEYS.count, id, 1],
      [
        'HSET',
        KEYS.meta,
        id,
        JSON.stringify({
          email: record.email,
          name: record.name,
          lastSeen: ts,
          lastPath: record.path,
        }),
      ],
      ['HSETNX', KEYS.first, id, String(ts)],
      ['LPUSH', KEYS.events, JSON.stringify(record)],
      ['LTRIM', KEYS.events, 0, EVENTS_CAP - 1],
      ['HINCRBY', KEYS.daily, day, 1],
    ]);
  } catch (e) {
    // 記録失敗はページ表示を妨げない。ログだけ残す。
    console.error('[access-log] KV write failed:', e?.message || e);
    console.log('[access-log]', JSON.stringify(record));
  }
}

// ダッシュボード用に集計データを取得する。KV 未設定なら null。
export async function getStats({ eventsLimit = 200 } = {}) {
  if (!kvEnabled()) return null;

  const [countMap, metaMap, firstMap, eventsRaw, dailyMap] = await kvPipeline([
    ['HGETALL', KEYS.count],
    ['HGETALL', KEYS.meta],
    ['HGETALL', KEYS.first],
    ['LRANGE', KEYS.events, 0, eventsLimit - 1],
    ['HGETALL', KEYS.daily],
  ]);

  const counts = hgetallToObj(countMap);
  const metas = hgetallToObj(metaMap);
  const firsts = hgetallToObj(firstMap);
  const dailies = hgetallToObj(dailyMap);

  const users = Object.keys(counts)
    .map((id) => {
      let meta = {};
      try {
        meta = JSON.parse(metas[id] || '{}');
      } catch {
        meta = {};
      }
      return {
        id,
        email: meta.email || null,
        name: meta.name || null,
        count: Number(counts[id] || 0),
        firstSeen: firsts[id] ? Number(firsts[id]) : null,
        lastSeen: meta.lastSeen ? Number(meta.lastSeen) : null,
      };
    })
    .sort((a, b) => (b.lastSeen || 0) - (a.lastSeen || 0));

  const recent = (eventsRaw || [])
    .map((s) => {
      try {
        return JSON.parse(s);
      } catch {
        return null;
      }
    })
    .filter(Boolean);

  const daily = Object.entries(dailies)
    .map(([date, n]) => ({ date, count: Number(n) }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));

  const totalViews = users.reduce((s, u) => s + u.count, 0);
  const uniqueUsers = users.length;

  return { users, recent, daily, totalViews, uniqueUsers };
}
