import { InternalToolDefinition, InternalToolContext, ToolExecutionResult } from '../../../../shared/types/tools';
import { DatabaseService } from '../../database/db-service';

export interface PastConversationsToolArgs {
  query: string;
  limit?: number;
}

export interface PastConversationsToolData {
  query: string;
  count: number;
  messages: Array<{
    conversationId: string;
    conversationTitle: string;
    role: 'user' | 'assistant';
    content: string;
    createdAt: string;
  }>;
}

export const pastConversationsTool: InternalToolDefinition<PastConversationsToolArgs, PastConversationsToolData> = {
  name: 'past_conversations_search',
  displayName: 'Conversation Archive Search',
  description: 'Search past conversation messages and earlier discussions across previous chat sessions.',
  category: 'search',
  permissionLevel: 'read_only',
  timeoutMs: 5000,
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Topic, question, or keywords from past discussions to look up.',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of past messages to return (1-8). Defaults to 4.',
      },
    },
    required: ['query'],
    additionalProperties: false,
  },
  isAvailable: (_context?: InternalToolContext): boolean => {
    return true;
  },
  execute: async (
    args: PastConversationsToolArgs,
    context: InternalToolContext
  ): Promise<ToolExecutionResult<PastConversationsToolData>> => {
    const startTime = Date.now();
    const query = (args.query || '').trim();

    if (!query) {
      return {
        success: false,
        toolName: 'past_conversations_search',
        error: 'Search query cannot be empty.',
        executionTimeMs: Date.now() - startTime,
      };
    }

    const limit = Math.min(Math.max(args.limit || 4, 1), 8);
    const messages = await DatabaseService.searchPastMessages(
      context.userId,
      query,
      context.conversationId,
      limit
    );

    return {
      success: true,
      toolName: 'past_conversations_search',
      data: {
        query,
        count: messages.length,
        messages,
      },
      executionTimeMs: Date.now() - startTime,
    };
  },
};
