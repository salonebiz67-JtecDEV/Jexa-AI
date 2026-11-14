import { InternalToolDefinition, InternalToolContext, ToolExecutionResult } from '../../../../shared/types/tools';
import { AIProviderRegistry } from '../../../../ai/providers/registry';
import { TavilyService } from '../../services/tavily.service';

export interface SystemCheckArgs {
  scope?: 'full' | 'quick';
}

export interface SystemCheckData {
  overallStatus: 'OK' | 'Warning' | 'Problem';
  architecture: 'stateless';
  server: {
    uptimeSeconds: number;
    uptimeFormatted: string;
    nodeVersion: string;
    platform: string;
    memoryRssMb: number;
    memoryHeapUsedMb: number;
  };
  aiProviders: {
    geminiText: { configured: boolean; model: string; backupModel: string };
    geminiVoice: { configured: boolean; model: string };
  };
  search: {
    tavilyConfigured: boolean;
  };
  environmentVariables: {
    set: string[];
    missing: string[];
  };
  recommendations: string[];
}

export const systemCheckTool: InternalToolDefinition<SystemCheckArgs, SystemCheckData> = {
  name: 'system_check',
  displayName: 'System Health & Infrastructure Self-Check',
  description: 'Run diagnostics on server health, Gemini AI providers, web search readiness, and environment configuration.',
  category: 'system',
  permissionLevel: 'sensitive',
  timeoutMs: 15000,
  inputSchema: {
    type: 'object',
    properties: {
      scope: {
        type: 'string',
        enum: ['full', 'quick'],
        description: 'Scope of the self-check (defaults to "full").',
      },
    },
    additionalProperties: false,
  },
  isAvailable: (): boolean => true,
  execute: async (
    _args: SystemCheckArgs,
    context: InternalToolContext
  ): Promise<ToolExecutionResult<SystemCheckData>> => {
    const startTime = Date.now();
    context.onStatusUpdate?.('Checking servers…');

    // 1. Server Uptime & Node info
    const uptimeSec = Math.floor(process.uptime());
    const days = Math.floor(uptimeSec / 86400);
    const hours = Math.floor((uptimeSec % 86400) / 3600);
    const minutes = Math.floor((uptimeSec % 3600) / 60);
    const seconds = uptimeSec % 60;
    const uptimeFormatted = `${days > 0 ? `${days}d ` : ''}${hours}h ${minutes}m ${seconds}s`;

    const mem = process.memoryUsage();
    const serverStats = {
      uptimeSeconds: uptimeSec,
      uptimeFormatted,
      nodeVersion: process.version,
      platform: process.platform,
      memoryRssMb: Math.round(mem.rss / 1024 / 1024),
      memoryHeapUsedMb: Math.round(mem.heapUsed / 1024 / 1024),
    };

    // 2. Environment Variables Audit (Names ONLY, NEVER values!)
    const auditVars = [
      'GEMINI_API_KEY',
      'TAVILY_API_KEY',
      'PORT',
      'NODE_ENV',
      'RENDER',
      'FRONTEND_URL',
      'CORS_ORIGIN',
    ];
    const setVars: string[] = [];
    const missingVars: string[] = [];
    for (const varName of auditVars) {
      if (process.env[varName]?.trim()) {
        setVars.push(varName);
      } else {
        missingVars.push(varName);
      }
    }

    // 3. AI Providers (Gemini Only)
    const registry = AIProviderRegistry.getInstance();
    let geminiConfigured = false;
    try {
      const gemini = registry.getTextProvider('gemini');
      geminiConfigured = Boolean(gemini?.isConfigured);
    } catch {
      geminiConfigured = Boolean(process.env.GEMINI_API_KEY?.trim());
    }

    const aiProviders = {
      geminiText: {
        configured: geminiConfigured,
        model: registry.getActiveTextModel(),
        backupModel: registry.getActiveBackupModel(),
      },
      geminiVoice: {
        configured: Boolean(process.env.GEMINI_API_KEY?.trim() || process.env.VOICE_AI_API_KEY?.trim()),
        model: registry.getActiveVoiceModel(),
      },
    };

    // 4. Tavily Search
    const search = {
      tavilyConfigured: TavilyService.isConfigured(),
    };

    // 5. Overall Status & Recommendations
    const recommendations: string[] = [];
    let overallStatus: 'OK' | 'Warning' | 'Problem' = 'OK';

    if (!geminiConfigured) {
      overallStatus = 'Problem';
      recommendations.push('GEMINI_API_KEY is not configured. Add GEMINI_API_KEY to enable Gemini chat and voice.');
    }

    if (!search.tavilyConfigured) {
      if (overallStatus === 'OK') overallStatus = 'Warning';
      recommendations.push(
        'TAVILY_API_KEY is not set. Add TAVILY_API_KEY to enable live web search.'
      );
    }

    return {
      success: true,
      toolName: 'system_check',
      data: {
        overallStatus,
        architecture: 'stateless',
        server: serverStats,
        aiProviders,
        search,
        environmentVariables: {
          set: setVars,
          missing: missingVars,
        },
        recommendations,
      },
      executionTimeMs: Date.now() - startTime,
    };
  },
};
