import React from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { LoginScreen } from './components/auth/LoginScreen';
import { ChatPage } from './pages/ChatPage';
import { RefreshCw } from 'lucide-react';

const AppContent: React.FC = () => {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen w-full flex flex-col items-center justify-center bg-[#070a12] text-slate-300">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shadow-[0_0_24px_rgba(16,185,129,0.2)]">
            <RefreshCw className="w-5 h-5 text-emerald-400 animate-spin" />
          </div>
          <div className="text-center space-y-1">
            <h2 className="text-sm font-semibold text-white tracking-wide font-['Syne',sans-serif]">JEXA</h2>
            <p className="text-xs text-slate-500">Restoring authenticated session...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    return <LoginScreen />;
  }

  return <ChatPage />;
};

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
