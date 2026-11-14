export interface SystemDiagnosticsStatus {
  timestamp: string;
  uptimeSeconds: number;
  environment: string;
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
  };
}
