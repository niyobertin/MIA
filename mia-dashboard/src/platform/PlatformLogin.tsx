import { useEffect, useState, type FormEvent } from 'react';
import { Eye, EyeOff, Mail, ShieldCheck } from 'lucide-react';
import { getErrorMessage } from '../lib/format';
import { platformApi, setPlatformToken, type LoginStep } from '../lib/platformAuth';
import { Button, inputClass } from '../ui/kit';

type Step = 'password' | 'verify';
const RESEND_SECONDS = 60;

export function PasswordField({ id, label, value, onChange, autoComplete, autoFocus }: { id: string; label: string; value: string; onChange: (value: string) => void; autoComplete: string; autoFocus?: boolean }) {
  const [shown, setShown] = useState(false);
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-slate-700 mb-1.5">{label}</label>
      <div className="relative">
        <input id={id} type={shown ? 'text' : 'password'} required autoFocus={autoFocus} autoComplete={autoComplete} value={value} onChange={(e) => onChange(e.target.value)} className={`${inputClass} pr-11`} />
        <button type="button" onClick={() => setShown((current) => !current)} aria-label={shown ? 'Hide password' : 'Show password'} aria-pressed={shown} className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-slate-500 hover:text-slate-800">
          {shown ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </div>
    </div>
  );
}

export function PlatformFrame({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center px-4 py-10 font-sans antialiased text-slate-800">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-lg bg-slate-900 flex items-center justify-center"><ShieldCheck className="w-5 h-5 text-white" /></div>
          <div>
            <div className="text-lg font-extrabold tracking-tight leading-none text-slate-900">MIA Platform</div>
            <div className="text-xs text-slate-500 font-medium">Staff only</div>
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4">
          <div>
            <h1 className="text-xl font-extrabold tracking-tight text-slate-900">{title}</h1>
            <p className="text-sm text-slate-500 mt-1">{subtitle}</p>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}

function Alert({ message }: { message: string }) {
  return <div role="alert" className="rounded-xl bg-rose-50 border border-rose-100 px-3 py-2.5 text-sm text-rose-700">{message}</div>;
}

export default function PlatformLogin() {
  const [step, setStep] = useState<Step>('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [challenge, setChallenge] = useState('');
  const [sentTo, setSentTo] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [wait, setWait] = useState(0);

  useEffect(() => {
    if (wait <= 0) return;
    const timer = setTimeout(() => setWait((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [wait]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const restart = (message: string) => {
    setStep('password');
    setPassword('');
    setCode('');
    setNotice(null);
    setError(message);
  };

  const submitPassword = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const { data } = await platformApi.post<LoginStep>('/auth/login', { email: email.trim(), password });
      setPassword('');
      if (data.step === 'done') {
        setPlatformToken(data.token);
        return;
      }
      setChallenge(data.challenge);
      setSentTo(data.sent_to);
      setNotice(null);
      setWait(RESEND_SECONDS);
      setStep('verify');
    } catch (problem) {
      setError(getErrorMessage(problem, 'Could not sign in.'));
    } finally {
      setBusy(false);
    }
  };

  const submitCode = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const { data } = await platformApi.post<LoginStep>('/auth/2fa/verify', { challenge, code });
      if (data.step === 'done') setPlatformToken(data.token);
    } catch (problem) {
      const status = (problem as { response?: { status?: number } }).response?.status;
      const message = getErrorMessage(problem, 'Could not verify that code.');
      if (status === 423 || (problem as { response?: { data?: { code?: string } } }).response?.data?.code === 'CHALLENGE_EXPIRED') restart(message);
      else setError(message);
      setCode('');
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    setError(null);
    setBusy(true);
    try {
      const { data } = await platformApi.post<{ sent_to: string }>('/auth/2fa/resend', { challenge });
      setSentTo(data.sent_to);
      setNotice(`A new code is on its way to ${data.sent_to}.`);
      setWait(RESEND_SECONDS);
      setCode('');
    } catch (problem) {
      const status = (problem as { response?: { status?: number } }).response?.status;
      const message = getErrorMessage(problem, 'Could not send a new code.');
      if (status === 423 || status === 401) restart(message);
      else setError(message);
    } finally {
      setBusy(false);
    }
  };

  if (step === 'password') {
    return (
      <PlatformFrame title="Sign in" subtitle="This area is for MIA staff. Business owners sign in at the main dashboard.">
        <form onSubmit={submitPassword} className="space-y-4">
          {error ? <Alert message={error} /> : null}
          <div>
            <label htmlFor="platform-email" className="block text-sm font-medium text-slate-700 mb-1.5">Email</label>
            <input id="platform-email" type="email" required autoFocus autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} />
          </div>
          <PasswordField id="platform-password" label="Password" value={password} onChange={setPassword} autoComplete="current-password" />
          <Button type="submit" tone="primary" disabled={busy} className="w-full !bg-slate-900 hover:!bg-slate-800">{busy ? 'Checking…' : 'Continue'}</Button>
        </form>
      </PlatformFrame>
    );
  }

  return (
    <PlatformFrame title="Check your email" subtitle={`We sent a 6-digit sign-in code to ${sentTo}. It expires in 10 minutes.`}>
      <form onSubmit={submitCode} className="space-y-4">
        {error ? <Alert message={error} /> : null}
        {notice && !error ? <div role="status" className="rounded-xl bg-emerald-50 border border-emerald-100 px-3 py-2.5 text-sm text-emerald-800">{notice}</div> : null}
        <div className="flex items-center gap-3 rounded-xl bg-slate-50 border border-slate-200 px-3 py-2.5 text-sm text-slate-600">
          <Mail size={18} className="text-slate-500 shrink-0" />
          <span>Can't find it? Check your spam folder.</span>
        </div>
        <div>
          <label htmlFor="platform-code" className="block text-sm font-medium text-slate-700 mb-1.5">6-digit code</label>
          <input id="platform-code" inputMode="numeric" autoComplete="one-time-code" autoFocus required pattern="[0-9]{6}" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} className={`${inputClass} tracking-[0.4em] text-center text-lg font-semibold`} />
        </div>
        <Button type="submit" tone="primary" disabled={busy || code.length !== 6} className="w-full !bg-slate-900 hover:!bg-slate-800">{busy ? 'Verifying…' : 'Verify and sign in'}</Button>
        <div className="flex items-center justify-between text-sm">
          <button type="button" onClick={() => restart('')} className="font-medium text-slate-600 hover:underline">Back to sign in</button>
          <button type="button" onClick={() => void resend()} disabled={busy || wait > 0} className="font-medium text-slate-900 hover:underline disabled:text-slate-400 disabled:no-underline">
            {wait > 0 ? `Send a new code in ${wait}s` : 'Send a new code'}
          </button>
        </div>
      </form>
    </PlatformFrame>
  );
}
