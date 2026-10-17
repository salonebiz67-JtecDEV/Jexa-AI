export interface SystemDiagnosticsStatus {
  timestamp: string;
  uptimeSeconds: number;
  environment: string;
  database: {
    status: 'connected' | 'fallback_active' | 'error';
    provider: 'supabase' | 'in_memory_fallback';
    configured: boolean;
    latencyMs?: number;
    error?: string;
  };
  memory: {
    persistenceLayer: 'supabase' | 'in_memory_fallback';
    totalUserMemories: number;
    lastReinforcedAt?: string;
    readsSucceeding: boolean;
    writesSucceeding: boolean;
    lastError?: string;
  };
  aiProviders: {
    selectedTextProvider: string;
    selectedTextModel: string;
    textProviderStatus: 'CONNECTED' | 'ERROR' | 'UNAVAILABLE';
    textConfigured: boolean;
    selectedVoiceProvider: string;
    selectedVoiceModel: string;
    voiceProviderStatus: 'CONNECTED' | 'ERROR' | 'UNAVAILABLE';
    voiceConfigured: boolean;
    lastErrorCategory?: string;
    quotaStatus: string;
  };
  webSearch: {
    provider: 'tavily';
    configured: boolean;
    status: 'available' | 'unavailable';
  };
  voiceServices: {
    ttsAvailable: boolean;
    geminiLiveAvailable: boolean;
    speechRecognitionSupported: boolean;
  };
  recentOperations: {
    lastChatTimestamp?: string;
    lastChatSuccess?: boolean;
    lastMemoryAction?: string;
    lastMemoryTimestamp?: string;
  };
}
