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
      const seenUrls = new Set<string>();
      const seenTitles = new Set<string>();

      const boilerplatePatterns = [
        /enable\s+javascript/i,
        /skip\s+to\s+(main\s+)?content/i,
        /checking\s+your\s+browser/i,
        /verify\s+you\s+are\s+(a\s+)?human/i,
        /cloudflare\s+ray/i,
        /access\s+denied/i,
        /403\s+forbidden/i,
        /page\s+not\s+found/i,
      ];

      const sanitizedResults: WebSearchResultItem[] = [];

      for (const item of rawResults) {
        const rawUrl = (item.url || '').trim();
        if (!rawUrl) continue;

        // Normalize URL for deduplication
        let normalizedUrl = rawUrl;
        let domain = '';
        try {
          const parsed = new URL(rawUrl);
          domain = parsed.hostname.replace(/^www\./, '');
          parsed.searchParams.delete('utm_source');
          parsed.searchParams.delete('utm_medium');
          parsed.searchParams.delete('utm_campaign');
          parsed.searchParams.delete('utm_term');
          parsed.searchParams.delete('utm_content');
          parsed.hash = '';
          normalizedUrl = parsed.toString().replace(/\/+$/, '');
        } catch {
          domain = '';
        }

        if (seenUrls.has(normalizedUrl)) continue;
        seenUrls.add(normalizedUrl);

        let title = (item.title || domain || 'Web Result').trim();
        // Strip trailing site brand duplicate (e.g. "Headline - BBC News" when domain is bbc.com)
        if (domain) {
          const siteName = domain.split('.')[0];
          const brandRegex = new RegExp(`\\s*[-|–—:]\\s*${siteName}.*$`, 'i');
          title = title.replace(brandRegex, '').trim() || title;
        }

        const titleKey = title.toLowerCase().slice(0, 40);
        if (seenTitles.has(titleKey)) continue;
        seenTitles.add(titleKey);

        let content = (item.content || item.snippet || item.raw_content || '').trim();
        const hasBoilerplate = boilerplatePatterns.some((pattern) => pattern.test(content));
        if (hasBoilerplate && content.length < 120) {
          content = '';
        }

        const faviconUrl = domain
          ? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`
          : undefined;

        sanitizedResults.push({
          title,
          url: rawUrl,
          content,
          score: typeof item.score === 'number' ? item.score : undefined,
          publishedDate: item.published_date || item.publishedDate,
          domain: domain || undefined,
          faviconUrl,
        });
      }

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
