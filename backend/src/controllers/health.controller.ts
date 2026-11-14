import { Request, Response } from 'express';
import { AIProviderRegistry } from '../../../ai/providers/registry';
import { HealthCheckResponse } from '../../../shared/types';
import { JEXA_IDENTITY } from '../../../ai/brain/identity';

const startTime = Date.now();

export class HealthController {
  public static async getHealth(_req: Request, res: Response): Promise<void> {
    const registry = AIProviderRegistry.getInstance();
    const status = registry.getStatus(false);

    const response: HealthCheckResponse = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: Math.floor((Date.now() - startTime) / 1000),
      version: JEXA_IDENTITY.version,
      environment: process.env.NODE_ENV || 'development',
      services: {
        textAI: {
          provider: status.textProvider.type,
          status: status.textProvider.status,
        },
        voiceAI: {
          provider: status.voiceProvider.type,
          status: status.voiceProvider.status,
        },
      },
    };

    res.status(200).json(response);
  }
}
