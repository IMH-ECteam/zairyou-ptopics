# KENJE GROUP TOPICS — LINE WORKS SSO 版

凝ったデザインのトピックスページを、**LINE WORKS にログインできる社内スタッフだけ**に見せるための Next.js アプリ。
`*.vercel.app` の無料サブドメインで動くのでドメイン不要。デザイン（`public/topics.html`）は一切変更せず、入口（middleware）で認証を守る。

---

## 仕組み（ざっくり）

```
スタッフ → / → [middleware: セッションある？]
  ない ↓
  → /api/login → LINE WORKS 認可画面（普段のWorksアカウントでログイン）
  → /api/callback（codeをトークンに交換・Cookie発行）
  → /topics.html（デザインそのまま表示）
```

LINE WORKS テナント（御社）に登録したアプリなので、**ログインできる＝御社スタッフ**。
全スタッフ（FC・パート含む）が対象になる。

---

## セットアップ手順

### STEP 1. LINE WORKS Developer Console でアプリ登録（管理者権限が必要）

1. https://dev.worksmobile.com/ に管理者でログイン
2. 「アプリ」→ 新規アプリ作成（OAuth / User Account 認証 を有効化）
3. 以下を取得・設定:
   - **Client ID** / **Client Secret** … 後でVercelの環境変数へ
   - **Scope**: `openid`, `email`, `profile`
   - **Redirect URL**: `https://（あなたのVercel URL）/api/callback`
     - ※Vercelデプロイ後に確定するURLに合わせる。仮で入れて後から修正でOK

### STEP 2. GitHub に push

```bash
cd kenje-topics-sso
git init && git add -A && git commit -m "init"
# GitHubにリポジトリを作って push
```

### STEP 3. Vercel にデプロイ

1. https://vercel.com で「Add New Project」→ 上記GitHubリポジトリを選択
2. フレームワークは Next.js が自動検出される。そのまま Deploy
3. デプロイ完了後に出る `https://xxxx.vercel.app` が本番URL

### STEP 4. 環境変数を設定（Vercel → Settings → Environment Variables）

`.env.example` を参照して以下を登録:

| 変数 | 値 |
|------|----|
| `LW_CLIENT_ID` | STEP1のClient ID |
| `LW_CLIENT_SECRET` | STEP1のClient Secret |
| `LW_REDIRECT_URI` | `https://xxxx.vercel.app/api/callback`（実URL） |
| `SESSION_SECRET` | `openssl rand -hex 32` で生成した長い乱数 |

設定後、Vercelで **Redeploy**（環境変数を反映するため）。

### STEP 5. LINE WORKS の Redirect URL を実URLに合わせる

STEP1で仮入力していた場合、Developer Console の Redirect URL を
`https://xxxx.vercel.app/api/callback`（STEP3で確定した実URL）に修正。

---

## 完成

`https://xxxx.vercel.app` にアクセス → LINE WORKS ログイン → トピックス表示。
未ログインの人は必ずログイン画面に飛ばされる。

---

## アクセス解析（誰がいつ見たか）

ログイン中の社員がトピックスを開くたびに、**メール・名前・日時**をサーバー側
（`middleware.js`）で記録する。デザイン（`public/topics.html`）は一切変更していない。

### 見方

`https://xxxx.vercel.app/admin` にアクセスすると、社員専用のダッシュボードが開く。

- 総閲覧数 / 閲覧した社員数 / 本日・直近7日の閲覧数
- 日別の閲覧数グラフ（直近30日）
- **社員別 閲覧ランキング**（回数・初回・最終閲覧）
- 最近のアクセス一覧
- **CSV エクスポート**（社員別サマリ / アクセスログ）

### 保存先について（重要）

Vercel はサーバーレスで永続ディスクが無いため、履歴を残すには小さな保存先が要る。
本アプリは **Vercel KV(Upstash Redis)** を使う（追加ライブラリ不要・REST を直接利用）。

| 状態 | 挙動 |
|------|------|
| **KV 未設定** | そのまま動作。アクセス記録は Vercel の **Logs** に `[access-log] {...}` として出力（＝ゼロ設定で「誰がいつ」を確認可能）。`/admin` はセットアップ案内を表示。 |
| **KV 設定済み** | 履歴を永続保存し、`/admin` が集計ダッシュボードになる。 |

### KV を有効化する手順（約2分）

1. Vercel のプロジェクト → **Storage** → **Create Database** → **KV (Upstash Redis)**
2. 作成した DB をこのプロジェクトに **Connect**
   → `KV_REST_API_URL` / `KV_REST_API_TOKEN` が自動で環境変数に追加される
3. **Redeploy**（環境変数を反映）→ `/admin` がダッシュボードに切り替わる

### 管理者を限定する（任意）

環境変数 `ADMIN_EMAILS` に管理者メールをカンマ区切りで設定すると、`/admin` と
CSV エクスポートを**その社員だけ**に絞れる（未設定ならログイン中の全社員が閲覧可）。

```
ADMIN_EMAILS=manager@example.com,admin@example.com
```

> プライバシー配慮: 閲覧履歴は社内利用が前提。誰が見られるかは `ADMIN_EMAILS` で管理する。

---

## カスタマイズ

- **セッション時間**: `lib/session.js` の `setExpirationTime('8h')` を変更
- **特定ドメイン/組織だけに絞る**: `.env` の `ALLOWED_DOMAINS` を設定し、
  `app/api/callback/route.js` の該当チェックのコメントを解除
- **毎月の号の差し替え**: `public/topics.html` を新しい号に置き換えて push するだけ
- **ログアウト**: `/api/logout` にアクセス

## セキュリティ補強（任意）

現状、`id_token` はトークンエンドポイントからTLS経由のサーバー間通信で取得しており、
ブラウザを経由しないため実用上の信頼性は確保されている。
より厳密にするなら、`https://auth.worksmobile.com/.well-known/openid-configuration`
の `jwks_uri` を使って `id_token` の署名検証を `jose` の `jwtVerify` + リモートJWKSで追加するとよい。

## ローカル開発

```bash
npm install
cp .env.example .env.local   # 値を埋める。LW_REDIRECT_URI は http://localhost:3000/api/callback
npm run dev
```
※ローカルテスト時はDeveloper ConsoleのRedirect URLに localhost 版も追加しておく。
