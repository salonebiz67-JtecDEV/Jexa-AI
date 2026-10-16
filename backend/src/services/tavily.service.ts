import { WebSearchResultItem } from '../../../shared/types/chat';

export interface TavilySearchOptions {
  maxResults?: number;
  searchDepth?: 'basic' | 'advanced';
  includeAnswer?: boolean;
}

export interface TavilySearchResult {
  success: boolean;
  query: string;
  results: WebSearchResultItem[];
  error?: string;
  code?: 'MISSING_TAVILY_KEY' | 'API_ERROR' | 'NETWORK_ERROR' | 'TIMEOUT';
}

export class TavilyService {
  private static readonly API_ENDPOINT = 'https://api.tavily.com/search';

  /**
   * Check if TAVILY_API_KEY is configured in backend environment variables
   */
  public static isConfigured(): boolean {
    const key = process.env.TAVILY_API_KEY?.trim();
    return Boolean(key && key.length > 5);
  }

  /**
   * Perform live web search using Tavily API
   */
  public static async search(
    query: string,
    options: TavilySearchOptions = {}
  ): Promise<TavilySearchResult> {
    const trimmedQuery = query?.trim();
    if (!trimmedQuery) {
      return {
        success: false,
        query: '',
        results: [],
        error: 'Search query cannot be empty.',
      };
    }

    const apiKey = process.env.TAVILY_API_KEY?.trim();

    if (!apiKey) {
      return {
        success: false,
        query: trimmedQuery,
        results: [],
        code: 'MISSING_TAVILY_KEY',
        error: 'TAVILY_API_KEY is not configured in backend environment variables.',
      };
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

    try {
      const response = await fetch(this.API_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          api_key: apiKey,
          query: trimmedQuery,
          search_depth: options.searchDepth || 'basic',
          include_answer: false,
          include_images: false,
          max_results: Math.min(options.maxResults || 5, 8),
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        let errMessage = `Tavily API responded with HTTP ${response.status}`;
        try {
          const errorJson = await response.json();
          if (errorJson.detail) {
            errMessage = errorJson.detail;
          } else if (errorJson.error) {
            errMessage = typeof errorJson.error === 'string' ? errorJson.error : JSON.stringify(errorJson.error);
          }
        } catch {
          // ignore json parse error on error response
        }

        console.error('[TavilyService] Search API error:', errMessage);
        return {
          success: false,
          query: trimmedQuery,
          results: [],
          code: 'API_ERROR',
          error: errMessage,
        };
      }

      const data = await response.json();
      const rawResults = Array.isArray(data.results) ? data.results : [];

      const sanitizedResults: WebSearchResultItem[] = rawResults
        .map((item: any) => {
          const rawUrl = (item.url || '').trim();
          let domain = '';
          try {
            domain = new URL(rawUrl).hostname.replace(/^www\./, '');
          } catch {
            domain = '';
          }
          const faviconUrl = domain
            ? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`
            : undefined;

          return {
            title: (item.title || domain || 'Web Result').trim(),
            url: rawUrl,
            content: (item.content || item.snippet || item.raw_content || '').trim(),
            score: typeof item.score === 'number' ? item.score : undefined,
            publishedDate: item.published_date || item.publishedDate,
            domain: domain || undefined,
            faviconUrl,
          };
        })
        .filter((item: WebSearchResultItem) => item.url && item.title);

      return {
        success: true,
        query: trimmedQuery,
        results: sanitizedResults,
      };
    } catch (err: any) {
      clearTimeout(timeoutId);
      const isTimeout = err.name === 'AbortError';
      const errorMessage = isTimeout
        ? 'Tavily web search request timed out.'
        : `Network error connecting to Tavily: ${err.message}`;

      console.error('[TavilyService] Exception during search:', errorMessage);
      return {
        success: false,
        query: trimmedQuery,
        results: [],
        code: isTimeout ? 'TIMEOUT' : 'NETWORK_ERROR',
        error: errorMessage,
      };
    }
  }
}
