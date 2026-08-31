import { type FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

export function SignupPage() {
  const { signUp } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError('パスワードが一致しません。');
      return;
    }

    setIsSubmitting(true);
    try {
      await signUp(email, password);
      navigate(`/confirm?email=${encodeURIComponent(email)}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : '登録に失敗しました。');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="page">
      <h1>新規登録</h1>
      <p className="page__lead">
        メールアドレスとパスワードで登録します。登録後、確認コードがメールで届きます。
      </p>

      <form className="card story-form auth-form" onSubmit={handleSubmit}>
        <label htmlFor="signup-email">メールアドレス</label>
        <input
          id="signup-email"
          required
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@example.com"
        />

        <label htmlFor="signup-password">パスワード（8文字以上）</label>
        <input
          id="signup-password"
          required
          type="password"
          minLength={8}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />

        <label htmlFor="signup-confirm-password">パスワード（確認）</label>
        <input
          id="signup-confirm-password"
          required
          type="password"
          minLength={8}
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
        />

        <button type="submit" className="btn btn--primary" disabled={isSubmitting}>
          {isSubmitting ? '登録中…' : '登録する'}
        </button>

        {error && <p className="field-error">{error}</p>}
      </form>

      <p className="auth-form__switch">
        既にアカウントをお持ちの方は<Link to="/login">ログイン</Link>
      </p>
    </div>
  );
}
