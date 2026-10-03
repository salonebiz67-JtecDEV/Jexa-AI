import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertCircle, RefreshCw, RotateCcw, Terminal, ChevronDown, ChevronUp } from 'lucide-react';
import { safeStorage } from '../../services/storage';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  showDiagnostics: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
    showDiagnostics: false,
  };

  public static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[JEXA ErrorBoundary] Captured error:', error, errorInfo);
    this.setState({ error, errorInfo });
  }

  private handleRetry = () => {
    this.setState({ hasError: false, error: null, errorInfo: null, showDiagnostics: false });
  };

  private handleReload = () => {
    window.location.reload();
  };

  private handleReset = () => {
    try {
      safeStorage.removeItem('jexa_text_provider');
      safeStorage.removeItem('jexa_voice_provider');
      safeStorage.removeItem('jexa_voice_name');
    } catch {
      // ignore
    }
    const base = (import.meta.env.BASE_URL || '/').replace(/\/+$/, '');
    window.location.href = base || '/';
  };

  private toggleDiagnostics = () => {
    this.setState((prev) => ({ showDiagnostics: !prev.showDiagnostics }));
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
                JEXA encountered a temporary problem.
              </h1>
              <p className="text-xs text-slate-400 leading-relaxed">
                The interface paused safely. Your conversation state and memory foundation remain preserved.
              </p>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
              <button
                type="button"
                onClick={this.handleRetry}
                className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-500 text-slate-950 font-semibold text-xs hover:bg-emerald-400 active:scale-95 transition-all shadow-sm"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Retry</span>
              </button>
              <button
                type="button"
                onClick={this.handleReload}
                className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-white/[0.08] hover:bg-white/[0.12] text-white font-medium text-xs border border-white/[0.08] active:scale-95 transition-all"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Reload App</span>
              </button>
              <button
                type="button"
                onClick={this.toggleDiagnostics}
                className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-white/[0.03] hover:bg-white/[0.06] text-slate-400 hover:text-slate-200 text-xs border border-white/[0.06] transition-all"
              >
                <Terminal className="w-3.5 h-3.5" />
                <span>Diagnostics</span>
                {this.state.showDiagnostics ? (
                  <ChevronUp className="w-3 h-3" />
                ) : (
                  <ChevronDown className="w-3 h-3" />
                )}
              </button>
            </div>

            {/* Diagnostics Drawer (Hidden by default) */}
            {this.state.showDiagnostics && (
              <div className="mt-4 p-3 rounded-xl bg-black/60 border border-white/[0.08] text-left space-y-2 max-h-48 overflow-y-auto">
                <div className="flex items-center justify-between text-[10px] text-slate-400 border-b border-white/[0.06] pb-1">
                  <span>Diagnostic Details</span>
                  <button
                    type="button"
                    onClick={this.handleReset}
                    className="text-rose-400 hover:text-rose-300 underline"
                  >
                    Reset Cached Settings
                  </button>
                </div>
                <p className="text-[11px] font-mono text-rose-300 break-words">
                  {this.state.error?.message || 'Unknown error occurred'}
                </p>
                {this.state.errorInfo?.componentStack && (
                  <pre className="text-[9px] font-mono text-slate-500 whitespace-pre-wrap overflow-x-auto">
                    {this.state.errorInfo.componentStack}
                  </pre>
                )}
              </div>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
