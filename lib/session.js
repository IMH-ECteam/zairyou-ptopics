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

// middleware からセッションの有効性を確認する
export async function verifySession(token) {
  try {
    await jwtVerify(token, getSecret());
    return true;
  } catch {
    return false;
  }
}
