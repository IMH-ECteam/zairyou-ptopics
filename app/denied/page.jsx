export const metadata = {
  title: 'アクセス権限がありません',
};

export default function Denied() {
  return (
    <div
      style={{
        fontFamily: 'sans-serif',
        textAlign: 'center',
        padding: '60px 24px',
        color: '#3D3D3D',
      }}
    >
      <h2>アクセス権限がありません</h2>
      <p>このページはケンジグループのスタッフ専用です。</p>
      <p>LINE WORKS アカウントでログインし直してください。</p>
      <p style={{ marginTop: 24 }}>
        <a href="/api/login">再ログイン →</a>
      </p>
    </div>
  );
}
