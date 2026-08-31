import { type FormEvent, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

export function LoginPage() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const from = (location.state as { from?: { pathname: string } } | null)?.from?.pathname ?? '/';

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await signIn(email, password);
      navigate(from, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ログインに失敗しました。');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="page">
      <h1>ログイン</h1>

      <form className="card story-form auth-form" onSubmit={handleSubmit}>
        <label htmlFor="login-email">メールアドレス</label>
        <input
          id="login-email"
          required
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@example.com"
        />

        <label htmlFor="login-password">パスワード</label>
        <input
          id="login-password"
          required
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />

        <button type="submit" className="btn btn--primary" disabled={isSubmitting}>
          {isSubmitting ? 'ログイン中…' : 'ログイン'}
        </button>

        {error && <p className="field-error">{error}</p>}
      </form>

      <p className="auth-form__switch">
        アカウントをお持ちでない方は<Link to="/signup">新規登録</Link>
      </p>
    </div>
  );
}
