import { SignJWT, jwtVerify } from 'jose';

const getSecret = () => new TextEncoder().encode(process.env.SESSION_SECRET);

// ログイン成功後、自社の署名付きセッションCookieを発行する
export async function createSession(payload) {
  return await new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('8h') // 8時間で再ログイン。必要に応じて変更
    .sign(getSecret());
}

// セッションを検証し、ペイロード（sub / email / name）を取り出す。
// 無効なら null を返す。
export async function readSession(token) {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    return payload;
  } catch {
    return null;
  }
}

// middleware からセッションの有効性を確認する（互換用の真偽値版）
export async function verifySession(token) {
  return (await readSession(token)) !== null;
}
