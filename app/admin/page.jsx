import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { readSession } from '../../lib/session';
import { getStats, kvEnabled, jstDate } from '../../lib/analytics';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const metadata = {
  title: 'アクセス解析 | KENJE GROUP TOPICS',
};

function fmtJst(ts) {
  if (!ts) return '—';
  return new Date(Number(ts)).toLocaleString('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function relative(ts) {
  if (!ts) return '';
  const diff = Date.now() - Number(ts);
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'たった今';
  if (m < 60) return `${m}分前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}時間前`;
  const d = Math.floor(h / 24);
  return `${d}日前`;
}

export default async function AdminPage() {
  const token = cookies().get('lw_session')?.value;
  const session = token ? await readSession(token) : null;
  if (!session) redirect('/api/login');

  const admins = (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (admins.length && !admins.includes(String(session.email || '').toLowerCase())) {
    redirect('/denied');
  }

  // KV 未設定時はセットアップ案内を表示
  if (!kvEnabled()) {
    return <SetupNotice />;
  }

  const stats = await getStats({ eventsLimit: 100 });
  const today = jstDate();
  const todayCount = stats.daily.find((d) => d.date === today)?.count || 0;
  const last7 = stats.daily.slice(-7).reduce((s, d) => s + d.count, 0);
  const chartDays = stats.daily.slice(-30);
  const maxDaily = Math.max(1, ...chartDays.map((d) => d.count));

  return (
    <main className="wrap">
      <style>{css}</style>

      <header className="head">
        <div>
          <div className="eyebrow">KENJE GROUP TOPICS</div>
          <h1>アクセス解析</h1>
          <p className="sub">
            LINE WORKS でログインした社員のトピックス閲覧状況
            {admins.length ? '' : '（※ 現在は全ログイン社員が閲覧可。ADMIN_EMAILS で管理者限定にできます）'}
          </p>
        </div>
        <div className="actions">
          <a className="btn" href="/api/stats?type=users&format=csv">社員別CSV</a>
          <a className="btn" href="/api/stats?type=events&format=csv">アクセスログCSV</a>
          <a className="btn ghost" href="/topics.html">← トピックスへ</a>
        </div>
      </header>

      <section className="kpis">
        <Kpi label="総閲覧数" value={stats.totalViews.toLocaleString()} />
        <Kpi label="閲覧した社員数" value={stats.uniqueUsers.toLocaleString()} />
        <Kpi label="本日の閲覧数" value={todayCount.toLocaleString()} note={today} />
        <Kpi label="直近7日の閲覧数" value={last7.toLocaleString()} />
      </section>

      <section className="card">
        <h2>日別の閲覧数（直近30日）</h2>
        {chartDays.length === 0 ? (
          <p className="empty">まだデータがありません。</p>
        ) : (
          <div className="chart">
            {chartDays.map((d) => (
              <div className="bar-col" key={d.date} title={`${d.date}: ${d.count}件`}>
                <div className="bar-val">{d.count}</div>
                <div
                  className="bar"
                  style={{ height: `${Math.round((d.count / maxDaily) * 100)}%` }}
                />
                <div className="bar-x">{d.date.slice(5)}</div>
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="grid">
        <section className="card">
          <h2>社員別 閲覧ランキング</h2>
          {stats.users.length === 0 ? (
            <p className="empty">まだデータがありません。</p>
          ) : (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>社員</th>
                    <th className="num">閲覧回数</th>
                    <th>最終閲覧</th>
                    <th>初回閲覧</th>
                  </tr>
                </thead>
                <tbody>
                  {[...stats.users]
                    .sort((a, b) => b.count - a.count)
                    .map((u) => (
                      <tr key={u.id}>
                        <td>
                          <div className="name">{u.name || '(名前なし)'}</div>
                          <div className="mail">{u.email || u.id}</div>
                        </td>
                        <td className="num strong">{u.count}</td>
                        <td>
                          <div>{fmtJst(u.lastSeen)}</div>
                          <div className="mail">{relative(u.lastSeen)}</div>
                        </td>
                        <td>{fmtJst(u.firstSeen)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="card">
          <h2>最近のアクセス</h2>
          {stats.recent.length === 0 ? (
            <p className="empty">まだデータがありません。</p>
          ) : (
            <ul className="feed">
              {stats.recent.map((e, i) => (
                <li key={i}>
                  <span className="feed-name">{e.name || e.email || e.id}</span>
                  <span className="feed-time">{fmtJst(e.ts)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <footer className="foot">
        閲覧者: {session.name || session.email} ｜ このページは社内専用です。
      </footer>
    </main>
  );
}

function Kpi({ label, value, note }) {
  return (
    <div className="kpi">
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value}</div>
      {note ? <div className="kpi-note">{note}</div> : null}
    </div>
  );
}

function SetupNotice() {
  return (
    <main className="wrap">
      <style>{css}</style>
      <header className="head">
        <div>
          <div className="eyebrow">KENJE GROUP TOPICS</div>
          <h1>アクセス解析</h1>
        </div>
        <div className="actions">
          <a className="btn ghost" href="/topics.html">← トピックスへ</a>
        </div>
      </header>
      <section className="card">
        <h2>データベース（Vercel KV）が未設定です</h2>
        <p style={{ marginBottom: 16 }}>
          アクセス記録は現在、Vercel のランタイムログに <code>[access-log]</code> として
          出力されています（Vercel → プロジェクト → <b>Logs</b> で「誰がいつ見たか」を確認できます）。
          恒久的な保存とこのダッシュボードを有効にするには、Vercel KV を作成してください。
        </p>
        <ol className="steps">
          <li>Vercel のプロジェクト → <b>Storage</b> → <b>Create Database</b> → <b>KV (Upstash Redis)</b> を作成</li>
          <li>作成したデータベースをこのプロジェクトに <b>Connect</b>（<code>KV_REST_API_URL</code> / <code>KV_REST_API_TOKEN</code> が自動で環境変数に追加されます）</li>
          <li>再デプロイ（または Redeploy）すると、このページが集計ダッシュボードに切り替わります</li>
          <li>（任意）<code>ADMIN_EMAILS</code> に管理者のメールをカンマ区切りで設定すると、/admin をその社員だけに限定できます</li>
        </ol>
      </section>
    </main>
  );
}

const css = `
  * { box-sizing: border-box; }
  body { margin: 0; background: #FFFCE8; }
  .wrap {
    font-family: 'Noto Sans JP','Hiragino Kaku Gothic ProN','Meiryo',sans-serif;
    color: #3D3D3D; max-width: 1080px; margin: 0 auto; padding: 32px 20px 64px;
  }
  .head { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; flex-wrap: wrap; margin-bottom: 24px; }
  .eyebrow { font-size: 12px; letter-spacing: .12em; color: #C89B2C; font-weight: 700; }
  h1 { font-size: 28px; margin: 2px 0 6px; }
  .sub { font-size: 13px; color: #7a745f; margin: 0; max-width: 640px; }
  .actions { display: flex; gap: 8px; flex-wrap: wrap; }
  .btn { display: inline-block; padding: 8px 14px; border-radius: 999px; background: #3D3D3D; color: #fff; text-decoration: none; font-size: 13px; font-weight: 700; }
  .btn.ghost { background: transparent; color: #3D3D3D; border: 1px solid #d9d3bd; }
  .kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 24px; }
  .kpi { background: #fff; border: 1px solid #efe9d2; border-radius: 14px; padding: 16px 18px; }
  .kpi-label { font-size: 12px; color: #8a846d; }
  .kpi-value { font-size: 30px; font-weight: 800; line-height: 1.2; font-family: 'Barlow Condensed',sans-serif; }
  .kpi-note { font-size: 11px; color: #a99a80; }
  .card { background: #fff; border: 1px solid #efe9d2; border-radius: 16px; padding: 20px 22px; margin-bottom: 20px; }
  .card h2 { font-size: 16px; margin: 0 0 16px; }
  .grid { display: grid; grid-template-columns: 1.4fr 1fr; gap: 20px; }
  .chart { display: flex; align-items: flex-end; gap: 6px; height: 180px; overflow-x: auto; padding-top: 18px; }
  .bar-col { display: flex; flex-direction: column; align-items: center; justify-content: flex-end; height: 100%; min-width: 26px; flex: 1; }
  .bar { width: 60%; min-height: 2px; background: linear-gradient(#E7C458,#C89B2C); border-radius: 4px 4px 0 0; }
  .bar-val { font-size: 10px; color: #8a846d; margin-bottom: 4px; }
  .bar-x { font-size: 9px; color: #a99; margin-top: 6px; white-space: nowrap; transform: rotate(-45deg); transform-origin: center; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  .table-scroll { overflow-x: auto; }
  th, td { text-align: left; padding: 10px 8px; border-bottom: 1px solid #f0ecdc; vertical-align: top; }
  th { font-size: 11px; color: #8a846d; font-weight: 700; }
  .num { text-align: right; }
  .strong { font-weight: 800; font-size: 15px; }
  .name { font-weight: 700; }
  .mail { font-size: 11px; color: #a29a82; }
  .feed { list-style: none; margin: 0; padding: 0; }
  .feed li { display: flex; justify-content: space-between; gap: 12px; padding: 9px 2px; border-bottom: 1px solid #f0ecdc; font-size: 13px; }
  .feed-name { font-weight: 600; }
  .feed-time { color: #a29a82; font-size: 12px; white-space: nowrap; }
  .empty { color: #a29a82; font-size: 13px; }
  .steps { line-height: 1.9; padding-left: 20px; }
  code { background: #f4f0dd; padding: 1px 6px; border-radius: 5px; font-size: 12px; }
  .foot { margin-top: 24px; font-size: 12px; color: #a29a82; text-align: center; }
  @media (max-width: 720px) {
    .kpis { grid-template-columns: repeat(2, 1fr); }
    .grid { grid-template-columns: 1fr; }
  }
`;
