import { redirect } from 'next/navigation';

// ここに来る時点で middleware が認証済みを保証している
export default function Home() {
  redirect('/topics.html');
}
