export type ToolCategory =
  | 'search'
  | 'memory'
  | 'system'
  | 'computation'
  | 'custom';

export type ToolPermissionLevel = 'read_only' | 'sensitive' | 'destructive';

export interface JSONSchemaProperty {
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  description: string;
  enum?: string[];
  items?: JSONSchemaProperty;
  default?: any;
}

export interface ToolInputSchema {
  type: 'object';
  properties: Record<string, JSONSchemaProperty>;
  required?: string[];
  additionalProperties?: boolean;
}

export interface InternalToolContext {
  userId?: string;
  conversationId?: string;
  isOwner?: boolean;
  onStatusUpdate?: (status: any, details?: any) => void;
  userContext?: {
    location?: string;
    timezone?: string;
    userName?: string;
  };
  signal?: AbortSignal;
}

export interface SourceDisclosure {
  title: string;
  url: string;
  domain?: string;
  snippet?: string;
  publishedDate?: string;
  isAccessible?: boolean;
  authoritative?: boolean;
}

export interface ToolExecutionResult<T = any> {
  success: boolean;
  toolName: string;
  data?: T;
  error?: string;
  sourceDisclosures?: SourceDisclosure[];
  executionTimeMs: number;
}

export interface InternalToolDefinition<TArgs = any, TResult = any> {
  name: string;
  displayName: string;
  description: string;
  category: ToolCategory;
  permissionLevel: ToolPermissionLevel;
  timeoutMs: number;
  inputSchema: ToolInputSchema;
  isAvailable: (context?: InternalToolContext) => boolean | Promise<boolean>;
  execute: (args: TArgs, context: InternalToolContext) => Promise<ToolExecutionResult<TResult>>;
}

export type ToolExecutionStatus =
  | 'idle'
  | 'selecting'
  | 'executing'
  | 'verifying'
  | 'success'
  | 'failed';

export interface ToolExecutionEvent {
  toolName: string;
  status: ToolExecutionStatus;
  statusLabel: string;
  details?: Record<string, any>;
}

export interface ToolCallRequest {
  toolName: string;
  arguments: Record<string, any>;
  reason?: string;
}

export interface ToolSelectionResult {
  shouldExecuteTools: boolean;
  calls: ToolCallRequest[];
  reason?: string;
}
