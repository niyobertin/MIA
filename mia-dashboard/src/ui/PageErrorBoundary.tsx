import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import { cardClass } from './kit';

type Props = { children: ReactNode };
type State = { failed: boolean };

export class PageErrorBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Page failed to render', error, info.componentStack);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div role="alert" className={`${cardClass} mx-auto mt-6 flex max-w-lg flex-col items-center gap-3 px-6 py-10 text-center`}>
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-50 text-amber-600">
          <AlertTriangle size={22} />
        </div>
        <h2 className="text-lg font-extrabold tracking-tight text-slate-900">This page could not be shown</h2>
        <p className="text-sm text-slate-500">Something in this page's data was not as expected. Your records are safe. Try again, or open another page from the menu.</p>
        <button
          onClick={() => this.setState({ failed: false })}
          className="mt-1 inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800"
        >
          <RotateCcw size={15} /> Try again
        </button>
      </div>
    );
  }
}
