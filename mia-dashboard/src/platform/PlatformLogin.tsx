import { useState, type FormEvent } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Eye, EyeOff, ShieldCheck } from 'lucide-react';
import { getErrorMessage } from '../lib/format';
import { platformApi, setPlatformToken, type LoginStep } from '../lib/platformAuth';
import { Button, inputClass } from '../ui/kit';

type Step = 'password' | 'enroll' | 'verify';

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
  const [setup, setSetup] = useState<{ secret: string; otpauth_uri: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const restart = (message: string) => {
    setStep('password');
    setPassword('');
    setCode('');
    setSetup(null);
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
      if (data.step === 'enroll') {
        const enrollment = await platformApi.post('/auth/2fa/setup', { challenge: data.challenge });
        setSetup(enrollment.data);
      }
      setStep(data.step);
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
    <PlatformFrame
      title={step === 'enroll' ? 'Set up two-factor sign-in' : 'Enter your code'}
      subtitle={step === 'enroll' ? 'Scan this with an authenticator app such as Google Authenticator, then enter the 6-digit code.' : 'Open your authenticator app and enter the 6-digit code.'}
    >
      <form onSubmit={submitCode} className="space-y-4">
        {error ? <Alert message={error} /> : null}
        {step === 'enroll' && setup ? (
          <div className="space-y-3">
            <div className="flex justify-center rounded-xl border border-slate-200 p-3"><QRCodeSVG value={setup.otpauth_uri} size={176} title="Two-factor setup code" /></div>
            <div className="text-xs text-slate-500">
              Can't scan it? Enter this key by hand:
              <code className="mt-1 block break-all rounded-lg bg-slate-100 px-2 py-1.5 font-mono text-slate-800">{setup.secret}</code>
            </div>
          </div>
        ) : null}
        <div>
          <label htmlFor="platform-code" className="block text-sm font-medium text-slate-700 mb-1.5">6-digit code</label>
          <input id="platform-code" inputMode="numeric" autoComplete="one-time-code" autoFocus required pattern="[0-9]{6}" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} className={inputClass} />
        </div>
        <Button type="submit" tone="primary" disabled={busy} className="w-full !bg-slate-900 hover:!bg-slate-800">{busy ? 'Verifying…' : 'Verify and sign in'}</Button>
        <button type="button" onClick={() => restart('')} className="text-sm font-medium text-slate-600 hover:underline">Back to sign in</button>
      </form>
    </PlatformFrame>
  );
}
