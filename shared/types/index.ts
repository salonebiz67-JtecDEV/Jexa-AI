export * from './chat';
export * from './brain';
export * from './provider';
export * from './features';
export * from './diagnostics';
export * from './tools';

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
  gatewayActive?: boolean;
  services: {
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
