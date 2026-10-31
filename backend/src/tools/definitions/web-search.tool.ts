import { InternalToolDefinition, InternalToolContext, ToolExecutionResult } from '../../../../shared/types/tools';
import { TavilyService, WebPageExtractResult } from '../../services/tavily.service';
import { WebSearchResultItem } from '../../../../shared/types/chat';

export interface WebSearchToolArgs {
  query: string;
  maxResults?: number;
  searchDepth?: 'basic' | 'advanced';
  inspectPages?: boolean;
  urlsToInspect?: string[];
}

export interface WebSearchToolData {
  query: string;
  resultsCount: number;
  results: WebSearchResultItem[];
  inspectedPages?: WebPageExtractResult[];
  summarySnippet?: string;
  authoritativeSourcesCount?: number;
}

export const webSearchTool: InternalToolDefinition<WebSearchToolArgs, WebSearchToolData> = {
  name: 'web_search',
  displayName: 'Web Research',
  description: 'Search the live web for current facts, recent events, breaking news, real-time data, and documentation.',
  category: 'search',
  permissionLevel: 'read_only',
  timeoutMs: 12000,
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'The specific search query string to look up on the live web.',
      },
      maxResults: {
        type: 'number',
        description: 'Maximum number of results to fetch (between 1 and 8). Defaults to 5.',
      },
      searchDepth: {
        type: 'string',
        enum: ['basic', 'advanced'],
        description: 'Search depth: basic for quick factual lookups, advanced for deep multi-source research.',
      },
      inspectPages: {
        type: 'boolean',
        description: 'Whether to inspect and extract content from key result pages for multi-source evidence verification.',
      },
      urlsToInspect: {
        type: 'array',
        description: 'Optional list of specific external webpage URLs to inspect or verify.',
      },
    },
    required: ['query'],
    additionalProperties: false,
  },
  isAvailable: (_context?: InternalToolContext): boolean => {
    return true;
  },
  execute: async (
    args: WebSearchToolArgs,
    _context: InternalToolContext
  ): Promise<ToolExecutionResult<WebSearchToolData>> => {
    const startTime = Date.now();
    const query = (args.query || '').trim();

    if (!query) {
      return {
        success: false,
        toolName: 'web_search',
        error: 'Search query cannot be empty.',
        executionTimeMs: Date.now() - startTime,
      };
    }

    if (!TavilyService.isConfigured()) {
      return {
        success: false,
        toolName: 'web_search',
        error: 'TAVILY_API_KEY is not configured on the backend server.',
        executionTimeMs: Date.now() - startTime,
      };
    }

    const searchRes = await TavilyService.search(query, {
      maxResults: Math.min(Math.max(args.maxResults || 5, 1), 8),
      searchDepth: args.searchDepth || 'basic',
    });

    const executionTimeMs = Date.now() - startTime;

    if (!searchRes.success) {
      return {
        success: false,
        toolName: 'web_search',
        error: searchRes.error || 'Live web search failed',
        executionTimeMs,
      };
    }

    let inspectedPages: WebPageExtractResult[] = [];
    const targetUrlsToInspect: string[] = [];

    if (Array.isArray(args.urlsToInspect) && args.urlsToInspect.length > 0) {
      targetUrlsToInspect.push(...args.urlsToInspect);
    } else if (args.inspectPages && searchRes.results.length > 0) {
      // Pick top 2-3 accessible candidate URLs for multi-source inspection
      const candidates = searchRes.results
        .filter((r) => r.url && (r.isAccessible !== false))
        .slice(0, 3)
        .map((r) => r.url);
      targetUrlsToInspect.push(...candidates);
    }

    if (targetUrlsToInspect.length > 0) {
      try {
        inspectedPages = await TavilyService.extractPages(targetUrlsToInspect, 4500);
      } catch (err: any) {
        console.warn('[webSearchTool] Page inspection error:', err.message);
      }
    }

    // Merge inspected page data back into search results
    const resultsWithInspection = searchRes.results.map((r) => {
      const match = inspectedPages.find((ip) => ip.url === r.url);
      if (match) {
        return {
          ...r,
          isAccessible: match.accessible,
          authoritative: match.authoritative ?? r.authoritative,
          inaccessibleReason: match.accessible ? undefined : (match.error || 'Page content could not be accessed'),
          extractedText: match.content || undefined,
        };
      }
      return r;
    });

    // If direct URLs were inspected that were not in search results, prepend them as primary sources
    for (const page of inspectedPages) {
      if (!resultsWithInspection.some((r) => r.url === page.url)) {
        resultsWithInspection.unshift({
          title: page.title || page.domain || page.url,
          url: page.url,
          domain: page.domain,
          content: page.content?.slice(0, 600) || '',
          extractedText: page.content || undefined,
          isAccessible: page.accessible,
          authoritative: page.authoritative,
          inaccessibleReason: page.accessible ? undefined : (page.error || 'Page content could not be accessed'),
          faviconUrl: page.domain
            ? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(page.domain)}&sz=64`
            : undefined,
        });
      }
    }

    const authoritativeSourcesCount = resultsWithInspection.filter((r) => r.authoritative).length;

    const sourceDisclosures = resultsWithInspection.map((r) => ({
      title: r.title,
      url: r.url,
      domain: r.domain,
      snippet: r.content?.slice(0, 280),
      publishedDate: r.publishedDate,
      isAccessible: r.isAccessible,
      authoritative: r.authoritative,
    }));

    return {
      success: true,
      toolName: 'web_search',
      data: {
        query,
        resultsCount: resultsWithInspection.length,
        results: resultsWithInspection,
        inspectedPages: inspectedPages.length > 0 ? inspectedPages : undefined,
        summarySnippet: resultsWithInspection[0]?.content?.slice(0, 300),
        authoritativeSourcesCount,
      },
      sourceDisclosures,
      executionTimeMs: Date.now() - startTime,
    };
  },
};
