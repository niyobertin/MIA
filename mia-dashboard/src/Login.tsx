import { useState, type FormEvent, type ReactNode } from 'react';
import { AlertCircle, BarChart3, CheckCircle2, Eye, EyeOff } from 'lucide-react';
import { requestPinReset, resetPin, signIn } from './lib/auth';

type Step = 'signIn' | 'forgot' | 'reset';

const inputClass =
  'w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 shadow-sm focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-200';
const labelClass = 'block text-sm font-medium text-slate-700 mb-1.5';
const linkClass = 'text-sm font-medium text-emerald-700 hover:text-emerald-900 hover:underline underline-offset-2';

function PinField({ id, label, value, onChange, autoComplete }: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: string;
}) {
  const [shown, setShown] = useState(false);
  return (
    <div>
      <label htmlFor={id} className={labelClass}>{label}</label>
      <div className="relative">
        <input id={id} type={shown ? 'text' : 'password'} inputMode="numeric" autoComplete={autoComplete} required minLength={4} value={value} onChange={(e) => onChange(e.target.value)} className={`${inputClass} pr-11`} />
        <button type="button" onClick={() => setShown((current) => !current)} aria-label={shown ? 'Hide PIN' : 'Show PIN'} aria-pressed={shown} className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-xl text-slate-500 hover:text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-200">
          {shown ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </div>
    </div>
  );
}

function Notice({ tone, children }: { tone: 'error' | 'success'; children: ReactNode }) {
  const isError = tone === 'error';
  const Icon = isError ? AlertCircle : CheckCircle2;
  return (
    <div role={isError ? 'alert' : 'status'} className={`flex gap-2 rounded-xl border px-3 py-2.5 text-sm ${isError ? 'bg-rose-50 border-rose-100 text-rose-700' : 'bg-emerald-50 border-emerald-100 text-emerald-800'}`}>
      <Icon size={16} className="shrink-0 mt-0.5" />
      <span>{children}</span>
    </div>
  );
}

const HEADINGS: Record<Step, { title: string; subtitle: string; submit: string; busy: string }> = {
  signIn: { title: 'Sign in', subtitle: 'Use the email and PIN from your MIA app.', submit: 'Sign in', busy: 'Signing in…' },
  forgot: { title: 'Reset your PIN', subtitle: 'Enter your account email and we will send you a 6-digit code.', submit: 'Send code', busy: 'Sending…' },
  reset: { title: 'Choose a new PIN', subtitle: 'If that email has a MIA account, a code is on its way. It expires in 15 minutes.', submit: 'Reset PIN', busy: 'Resetting…' },
};

export default function Login() {
  const [step, setStep] = useState<Step>('signIn');
  const [email, setEmail] = useState('');
  const [pin, setPin] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const heading = HEADINGS[step];

  const goTo = (next: Step, message: string | null = null) => {
    setStep(next);
    setPin('');
    setCode('');
    setError(null);
    setSuccess(message);
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setSuccess(null);
    setSubmitting(true);
    try {
      if (step === 'signIn') {
        await signIn(email, pin);
        return;
      }
      if (step === 'forgot') {
        await requestPinReset(email);
        goTo('reset');
      } else {
        await resetPin(email, code, pin);
        goTo('signIn', 'Your PIN has been changed. Sign in with your new PIN.');
      }
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'Something went wrong. Please try again.');
      if (step === 'signIn') setPin('');
    }
    setSubmitting(false);
  };

  const handleResend = async () => {
    setError(null);
    setSuccess(null);
    try {
      await requestPinReset(email);
      setSuccess('If that email has a MIA account, a new code will arrive shortly. Codes can be sent once a minute.');
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'Something went wrong. Please try again.');
    }
  };

  return (
    <div className="min-h-screen bg-[#f8fafb] flex items-center justify-center px-4 py-10 font-sans antialiased text-slate-800">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-emerald-400 to-teal-700 flex items-center justify-center shadow-lg shadow-emerald-900/20">
            <BarChart3 className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="text-lg font-extrabold tracking-tight leading-none text-slate-900">MIA</div>
            <div className="text-xs text-slate-500 font-medium">Business Management</div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-slate-200/60 p-6 shadow-[0_1px_2px_rgba(0,0,0,0.04)] space-y-4">
          <div>
            <h1 className="text-xl font-extrabold tracking-tight text-slate-900">{heading.title}</h1>
            <p className="text-sm text-slate-500 mt-1">{heading.subtitle}</p>
          </div>

          {error ? <Notice tone="error">{error}</Notice> : null}
          {success ? <Notice tone="success">{success}</Notice> : null}

          {step !== 'reset' ? (
            <div>
              <label htmlFor="email" className={labelClass}>Email</label>
              <input id="email" type="email" autoComplete="username" autoFocus required value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} />
            </div>
          ) : (
            <div>
              <label htmlFor="code" className={labelClass}>6-digit code</label>
              <input id="code" type="text" inputMode="numeric" autoComplete="one-time-code" autoFocus required pattern="[0-9]{6}" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} className={inputClass} />
            </div>
          )}

          {step === 'signIn' ? <PinField id="pin" label="PIN" value={pin} onChange={setPin} autoComplete="current-password" /> : null}
          {step === 'reset' ? <PinField id="new-pin" label="New 4-digit PIN" value={pin} onChange={(value) => setPin(value.replace(/\D/g, '').slice(0, 4))} autoComplete="new-password" /> : null}

          <button type="submit" disabled={submitting} className="w-full rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-800 focus:outline-none focus:ring-2 focus:ring-emerald-300 disabled:opacity-60">
            {submitting ? heading.busy : heading.submit}
          </button>

          <div className="flex items-center justify-between gap-3">
            {step === 'signIn' ? (
              <button type="button" onClick={() => goTo('forgot')} className={linkClass}>Forgot PIN?</button>
            ) : (
              <button type="button" onClick={() => goTo('signIn')} className={linkClass}>Back to sign in</button>
            )}
            {step === 'reset' ? <button type="button" onClick={handleResend} className={linkClass}>Send a new code</button> : null}
          </div>
        </form>
      </div>
    </div>
  );
}
