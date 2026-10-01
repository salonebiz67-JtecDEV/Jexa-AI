import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[JEXA ErrorBoundary] Uncaught runtime error:', error, errorInfo);
    this.setState({ error, errorInfo });
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleReset = () => {
    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch {
      // ignore storage errors
    }
    window.location.href = window.location.pathname;
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen w-screen bg-[#07090e] text-slate-100 flex items-center justify-center p-4 antialiased font-sans select-none">
          <div className="max-w-md w-full bg-[#0d121f] border border-white/[0.08] rounded-2xl p-6 sm:p-8 shadow-2xl text-center space-y-5">
            {/* Warning Icon */}
            <div className="w-12 h-12 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center mx-auto">
              <AlertCircle className="w-6 h-6" />
            </div>

            {/* Error Copy */}
            <div className="space-y-2">
              <h1 className="text-base sm:text-lg font-semibold text-white tracking-tight">
                JEXA could not load
              </h1>
              <p className="text-xs text-slate-400 leading-relaxed">
                An unexpected runtime error occurred while mounting the application.
              </p>
            </div>

            {/* Real Error Diagnostic Message */}
            {this.state.error?.message && (
              <div className="p-3 rounded-xl bg-black/40 border border-white/[0.06] text-left">
                <p className="text-[11px] font-mono text-rose-300 break-words">
                  {this.state.error.message}
                </p>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                onClick={this.handleReload}
                className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-white text-slate-950 font-semibold text-xs hover:bg-slate-200 transition-colors shadow-sm"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Reload Page</span>
              </button>
              <button
                onClick={this.handleReset}
                className="px-4 py-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] text-slate-300 text-xs font-medium transition-colors border border-white/[0.06]"
              >
                Reset Session
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
