export * from './chat';
export * from './brain';
export * from './memory';
export * from './provider';
export * from './features';

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: string;
}

export interface HealthCheckResponse {
  status: 'healthy' | 'degraded';
  timestamp: string;
  uptime: number;
  version: string;
  environment: string;
  services: {
    database: {
      provider: string;
      status: 'connected' | 'fallback_active';
    };
    textAI: {
      provider: string;
      status: string;
    };
    voiceAI: {
      provider: string;
      status: string;
    };
  };
}
