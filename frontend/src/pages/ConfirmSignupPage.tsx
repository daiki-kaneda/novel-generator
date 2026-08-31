import { type FormEvent, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

export function ConfirmSignupPage() {
  const { confirmSignUp, resendConfirmationCode } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState(searchParams.get('email') ?? '');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResending, setIsResending] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setIsSubmitting(true);
    try {
      await confirmSignUp(email, code);
      navigate('/login');
    } catch (err) {
      setError(err instanceof Error ? err.message : '確認に失敗しました。');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResend = async () => {
    setError(null);
    setNotice(null);
    setIsResending(true);
    try {
      await resendConfirmationCode(email);
      setNotice('確認コードを再送しました。');
    } catch (err) {
      setError(err instanceof Error ? err.message : '再送に失敗しました。');
    } finally {
      setIsResending(false);
    }
  };

  return (
    <div className="page">
      <h1>メールアドレスの確認</h1>
      <p className="page__lead">登録したメールアドレスに送られた確認コードを入力してください。</p>

      <form className="card story-form auth-form" onSubmit={handleSubmit}>
        <label htmlFor="confirm-email">メールアドレス</label>
        <input
          id="confirm-email"
          required
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@example.com"
        />

        <label htmlFor="confirm-code">確認コード</label>
        <input
          id="confirm-code"
          required
          type="text"
          inputMode="numeric"
          value={code}
          onChange={(event) => setCode(event.target.value)}
          placeholder="123456"
        />

        <button type="submit" className="btn btn--primary" disabled={isSubmitting}>
          {isSubmitting ? '確認中…' : '確認する'}
        </button>

        <button
          type="button"
          className="btn btn--secondary"
          disabled={isResending || !email}
          onClick={handleResend}
        >
          {isResending ? '再送中…' : '確認コードを再送する'}
        </button>

        {notice && <p className="field-notice">{notice}</p>}
        {error && <p className="field-error">{error}</p>}
      </form>

      <p className="auth-form__switch">
        確認済みの方は<Link to="/login">ログイン</Link>
      </p>
    </div>
  );
}
