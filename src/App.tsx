import React from 'react';
import { ChatPage } from './pages/ChatPage';
import { AuthProvider } from './context/AuthContext';

export default function App() {
  return (
    <AuthProvider>
      <ChatPage />
    </AuthProvider>
  );
}
