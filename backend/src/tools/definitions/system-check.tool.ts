import { InternalToolDefinition, InternalToolContext, ToolExecutionResult } from '../../../../shared/types/tools';
import { getSupabaseClient, isSupabaseConfigured } from '../../database/supabase';
import { AIProviderRegistry } from '../../../../ai/providers/registry';
import { TavilyService } from '../../services/tavily.service';

export interface SystemCheckArgs {
  scope?: 'full' | 'quick' | 'database_only';
}

export interface SystemCheckData {
  overallStatus: 'OK' | 'Warning' | 'Problem';
  server: {
    uptimeSeconds: number;
    uptimeFormatted: string;
    nodeVersion: string;
    platform: string;
    memoryRssMb: number;
    memoryHeapUsedMb: number;
  };
  database: {
    configured: boolean;
    connection: 'connected' | 'unconfigured' | 'error';
    latencyMs?: number;
    tablesChecked: Record<string, 'present' | 'missing' | 'error'>;
    columnsChecked: Record<string, 'present' | 'missing' | 'error'>;
    readWriteTest: {
      status: 'passed' | 'failed' | 'skipped';
      latencyMs?: number;
      error?: string;
    };
    error?: string;
  };
  aiProviders: {
    geminiText: { configured: boolean; model: string };
    groqText: { configured: boolean; model: string };
    geminiVoice: { configured: boolean };
    elevenLabsVoice: { configured: boolean };
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
  description:
    'Tests Supabase connection and query speed, checks every table and schema column (including memories.memory_type), performs safe read/write tests, inspects AI provider status (Gemini, Groq), Tavily web search, voice synthesis, server uptime, and verifies which Render environment variables are set or missing (names only, never secret values). Use this tool when the owner asks to "check the systems", "run diagnostics", "is Supabase okay?", "health check", "how are the servers?", or requests an architecture check.',
  category: 'system',
  permissionLevel: 'sensitive',
  timeoutMs: 15000,
  inputSchema: {
    type: 'object',
    properties: {
      scope: {
        type: 'string',
        enum: ['full', 'quick', 'database_only'],
        description: 'Scope of the self-check (defaults to "full").',
      },
    },
    additionalProperties: false,
  },
  isAvailable: (context?: InternalToolContext): boolean => {
    return Boolean(context?.isOwner);
  },
  execute: async (
    _args: SystemCheckArgs,
    context: InternalToolContext
  ): Promise<ToolExecutionResult<SystemCheckData>> => {
    const startTime = Date.now();

    // Guard: Only authorized owner can execute this tool
    if (!context?.isOwner) {
      return {
        success: false,
        toolName: 'system_check',
        error: 'Access denied: The system_check tool is strictly restricted to the verified system owner (matching OWNER_ACCESS_KEY).',
        executionTimeMs: Date.now() - startTime,
      };
    }

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
      'OWNER_ACCESS_KEY',
      'GEMINI_API_KEY',
      'GROQ_API_KEY',
      'TAVILY_API_KEY',
      'ELEVENLABS_API_KEY',
      'SUPABASE_URL',
      'SUPABASE_SERVICE_ROLE_KEY',
      'SUPABASE_ANON_KEY',
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

    // 3. Database Check
    context.onStatusUpdate?.('Checking Supabase…');
    const client = getSupabaseClient();
    const tablesToCheck = [
      'users',
      'conversations',
      'messages',
      'user_settings',
      'ai_settings',
      'user_preferences',
      'memories',
      'research_history',
      'database_diagnostics_test',
      'system_error_logs',
    ];

    const tablesChecked: Record<string, 'present' | 'missing' | 'error'> = {};
    const columnsChecked: Record<string, 'present' | 'missing' | 'error'> = {};
    let dbConnection: 'connected' | 'unconfigured' | 'error' = 'unconfigured';
    let dbLatencyMs: number | undefined;
    let dbErrorMsg: string | undefined;

    let rwTest: {
      status: 'passed' | 'failed' | 'skipped';
      latencyMs?: number;
      error?: string;
    } = { status: 'skipped' };

    if (isSupabaseConfigured && client) {
      const pingStart = Date.now();
      try {
        const { error: pingError } = await client.from('users').select('id').limit(1);
        if (pingError) {
          dbConnection = 'error';
          dbErrorMsg = pingError.message;
        } else {
          dbConnection = 'connected';
          dbLatencyMs = Date.now() - pingStart;
        }
      } catch (err: any) {
        dbConnection = 'error';
        dbErrorMsg = err.message;
      }

      // Check all tables
      for (const table of tablesToCheck) {
        try {
          const { error } = await client.from(table).select('*', { count: 'exact', head: true });
          if (!error) {
            tablesChecked[table] = 'present';
          } else if ((error as any).code === '42P01' || error.message?.includes('relation') || error.message?.includes('does not exist')) {
            tablesChecked[table] = 'missing';
          } else {
            tablesChecked[table] = 'present'; // Table exists, might have RLS notice
          }
        } catch {
          tablesChecked[table] = 'error';
        }
      }

      // Check important schema columns explicitly
      // 1. memories.memory_type
      try {
        const { error } = await client.from('memories').select('id, memory_type').limit(1);
        if (error && ((error as any).code === '42703' || error.message?.includes('memory_type'))) {
          columnsChecked['memories.memory_type'] = 'missing';
        } else {
          columnsChecked['memories.memory_type'] = 'present';
        }
      } catch {
        columnsChecked['memories.memory_type'] = 'error';
      }

      // 2. messages.metadata
      try {
        const { error } = await client.from('messages').select('id, metadata').limit(1);
        if (error && ((error as any).code === '42703' || error.message?.includes('metadata'))) {
          columnsChecked['messages.metadata'] = 'missing';
        } else {
          columnsChecked['messages.metadata'] = 'present';
        }
      } catch {
        columnsChecked['messages.metadata'] = 'error';
      }

      // 3. user_settings.selected_text_provider
      try {
        const { error } = await client.from('user_settings').select('id, selected_text_provider').limit(1);
        if (error && ((error as any).code === '42703' || error.message?.includes('selected_text_provider'))) {
          columnsChecked['user_settings.selected_text_provider'] = 'missing';
        } else {
          columnsChecked['user_settings.selected_text_provider'] = 'present';
        }
      } catch {
        columnsChecked['user_settings.selected_text_provider'] = 'error';
      }

      // 4. system_error_logs.details
      try {
        const { error } = await client.from('system_error_logs').select('id, details').limit(1);
        if (error && ((error as any).code === '42703' || error.message?.includes('details'))) {
          columnsChecked['system_error_logs.details'] = 'missing';
        } else {
          columnsChecked['system_error_logs.details'] = 'present';
        }
      } catch {
        columnsChecked['system_error_logs.details'] = 'error';
      }

      // Safe Read / Write test
      try {
        const rwStart = Date.now();
        const testPayload = {
          source: 'system_check',
          message: 'Safe self-check diagnostic read/write probe',
          details: { probe_timestamp: new Date().toISOString() },
        };
        const { data: writeData, error: writeError } = await client
          .from('system_error_logs')
          .insert(testPayload)
          .select('id')
          .single();

        if (writeError) {
          rwTest = { status: 'failed', error: writeError.message };
        } else if (writeData?.id) {
          // Read back
          const { error: readError } = await client
            .from('system_error_logs')
            .select('id, source')
            .eq('id', writeData.id)
            .single();

          if (readError) {
            rwTest = { status: 'failed', error: readError.message };
          } else {
            rwTest = { status: 'passed', latencyMs: Date.now() - rwStart };
            // Clean up test entry
            await client.from('system_error_logs').delete().eq('id', writeData.id);
          }
        }
      } catch (rwErr: any) {
        rwTest = { status: 'failed', error: rwErr.message };
      }
    }

    // 4. AI Providers
    const registry = AIProviderRegistry.getInstance();
    let geminiConfigured = false;
    let groqConfigured = false;
    try {
      const gemini = registry.getTextProvider('gemini');
      geminiConfigured = Boolean(gemini?.isConfigured);
    } catch {
      geminiConfigured = Boolean(process.env.GEMINI_API_KEY?.trim());
    }
    try {
      const groq = registry.getTextProvider('groq');
      groqConfigured = Boolean(groq?.isConfigured);
    } catch {
      groqConfigured = Boolean(process.env.GROQ_API_KEY?.trim());
    }

    const aiProviders = {
      geminiText: { configured: geminiConfigured, model: 'gemini-2.5-flash' },
      groqText: { configured: groqConfigured, model: 'llama-3.3-70b-versatile' },
      geminiVoice: { configured: Boolean(process.env.GEMINI_API_KEY?.trim()) },
      elevenLabsVoice: { configured: Boolean(process.env.ELEVENLABS_API_KEY?.trim()) },
    };

    // 5. Tavily Search
    const search = {
      tavilyConfigured: TavilyService.isConfigured(),
    };

    // 6. Overall Status & Recommendations
    const recommendations: string[] = [];
    let overallStatus: 'OK' | 'Warning' | 'Problem' = 'OK';

    if (dbConnection !== 'connected') {
      overallStatus = 'Problem';
      recommendations.push(
        'Supabase is not connected. Configure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in Render environment variables.'
      );
    }

    const missingTables = Object.entries(tablesChecked).filter(([_, status]) => status === 'missing');
    if (missingTables.length > 0) {
      overallStatus = overallStatus === 'Problem' ? 'Problem' : 'Warning';
      recommendations.push(
        `Missing database tables: ${missingTables.map(([t]) => t).join(', ')}. Run schema.sql in Supabase SQL editor.`
      );
    }

    const missingColumns = Object.entries(columnsChecked).filter(([_, status]) => status === 'missing');
    if (missingColumns.length > 0) {
      overallStatus = overallStatus === 'Problem' ? 'Problem' : 'Warning';
      recommendations.push(
        `Missing schema columns: ${missingColumns.map(([c]) => c).join(', ')}. Apply schema migration in Supabase SQL editor.`
      );
    }

    if (!search.tavilyConfigured) {
      if (overallStatus === 'OK') overallStatus = 'Warning';
      recommendations.push(
        'TAVILY_API_KEY is not set. Add TAVILY_API_KEY to enable live web search.'
      );
    }

    if (!aiProviders.groqText.configured) {
      recommendations.push(
        'GROQ_API_KEY is not set (fallback provider). Add it to enable low-latency failover.'
      );
    }

    return {
      success: true,
      toolName: 'system_check',
      data: {
        overallStatus,
        server: serverStats,
        database: {
          configured: isSupabaseConfigured,
          connection: dbConnection,
          latencyMs: dbLatencyMs,
          tablesChecked,
          columnsChecked,
          readWriteTest: rwTest,
          error: dbErrorMsg,
        },
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
