import { WebSearchResultItem } from '../../../shared/types/chat';

export interface TavilySearchOptions {
  maxResults?: number;
  searchDepth?: 'basic' | 'advanced';
  includeAnswer?: boolean;
}

export interface WebPageExtractResult {
  url: string;
  title?: string;
  domain?: string;
  content: string;
  accessible: boolean;
  authoritative?: boolean;
  error?: string;
  statusCode?: number;
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
  private static readonly EXTRACT_ENDPOINT = 'https://api.tavily.com/extract';

  /**
   * Check if TAVILY_API_KEY is configured in backend environment variables
   */
  public static isConfigured(): boolean {
    const key = process.env.TAVILY_API_KEY?.trim();
    return Boolean(key && key.length > 5);
  }

  /**
   * Check if web search service is available based on real backend checks
   */
  public static checkAvailability(): { configured: boolean; status: 'available' | 'unavailable'; reason?: string } {
    const isConfig = this.isConfigured();
    if (!isConfig) {
      return {
        configured: false,
        status: 'unavailable',
        reason: 'TAVILY_API_KEY environment variable is not configured on the backend server',
      };
    }
    return {
      configured: true,
      status: 'available',
    };
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

        const isAuth = this.isAuthoritativeDomain(domain);
        const accessible = content.length > 20;

        sanitizedResults.push({
          title,
          url: rawUrl,
          content,
          score: typeof item.score === 'number' ? item.score : undefined,
          publishedDate: item.published_date || item.publishedDate,
          domain: domain || undefined,
          faviconUrl,
          isAccessible: accessible,
          authoritative: isAuth,
          inaccessibleReason: accessible ? undefined : 'Snippet content unavailable or blocked by source',
        });
      }

      // Prioritize authoritative sources first, then accessible pages, then score
      sanitizedResults.sort((a, b) => {
        if (Boolean(b.authoritative) !== Boolean(a.authoritative)) {
          return b.authoritative ? 1 : -1;
        }
        if (Boolean(b.isAccessible) !== Boolean(a.isAccessible)) {
          return b.isAccessible ? 1 : -1;
        }
        if (typeof b.score === 'number' && typeof a.score === 'number') {
          return b.score - a.score;
        }
        return 0;
      });

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

  /**
   * Validate external URL to ensure protocol safety and prevent SSRF to private/internal networks
   */
  public static validateExternalUrl(rawUrl: string): { valid: boolean; error?: string; url?: string; domain?: string } {
    if (!rawUrl || typeof rawUrl !== 'string') {
      return { valid: false, error: 'URL must be a non-empty string.' };
    }
    const trimmed = rawUrl.trim();
    if (!/^https?:\/\//i.test(trimmed)) {
      return { valid: false, error: 'Only HTTP and HTTPS URLs are permitted.' };
    }

    try {
      const parsed = new URL(trimmed);
      const hostname = parsed.hostname.toLowerCase();

      // Block SSRF / private networks / internal endpoints
      const isBlocked =
        hostname === 'localhost' ||
        hostname.endsWith('.localhost') ||
        hostname.endsWith('.local') ||
        hostname.endsWith('.internal') ||
        hostname === '127.0.0.1' ||
        hostname === '0.0.0.0' ||
        hostname === '::1' ||
        /^10\./.test(hostname) ||
        /^192\.168\./.test(hostname) ||
        /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(hostname) ||
        /^169\.254\./.test(hostname);

      if (isBlocked) {
        return { valid: false, error: 'Access to private internal network addresses is blocked for security.' };
      }

      return { valid: true, url: parsed.toString(), domain: hostname.replace(/^www\./, '') };
    } catch {
      return { valid: false, error: 'Malformed or invalid URL format.' };
    }
  }

  /**
   * Determine whether a domain represents an established, authoritative source
   */
  public static isAuthoritativeDomain(domain?: string): boolean {
    if (!domain) return false;
    const lower = domain.toLowerCase();
    if (lower.endsWith('.gov') || lower.includes('.gov.') || lower.endsWith('.edu') || lower.includes('.edu.')) {
      return true;
    }
    const authoritativeList = [
      'reuters.com',
      'apnews.com',
      'bbc.com',
      'bbc.co.uk',
      'bloomberg.com',
      'who.int',
      'un.org',
      'worldbank.org',
      'imf.org',
      'statehouse.gov.sl',
      'edsa.sl',
      'moe.gov.sl',
      'awokonewspaper.sl',
      'thesierraleonetelegraph.com',
      'politicosl.com',
      'developer.mozilla.org',
      'nodejs.org',
      'github.com',
      'w3.org',
      'ietf.org',
      // Official software & library documentation domains
      'react.dev',
      'reactjs.org',
      'nextjs.org',
      'vuejs.org',
      'angular.dev',
      'angular.io',
      'svelte.dev',
      'typescriptlang.org',
      'python.org',
      'docs.python.org',
      'pypi.org',
      'npmjs.com',
      'crates.io',
      'docs.rs',
      'pkg.go.dev',
      'go.dev',
      'rust-lang.org',
      'tailwindcss.com',
      'vite.dev',
      'vitejs.dev',
      'bun.sh',
      'deno.com',
      'deno.land',
      'orm.drizzle.team',
      'prisma.io',
      'supabase.com',
      'firebase.google.com',
      'cloud.google.com',
      'aws.amazon.com',
      'learn.microsoft.com',
      'docs.docker.com',
      'kubernetes.io',
      'developer.apple.com',
      'developer.android.com',
      'capacitorjs.com',
      'ionicframework.com',
      'tanstack.com',
      'zod.dev',
      'graphql.org',
      'electronjs.org',
      'stackoverflow.com',
    ];
    return authoritativeList.some((auth) => lower === auth || lower.endsWith('.' + auth));
  }

  /**
   * Inspect and extract content from specific external web pages with accessibility verification
   */
  public static async extractPages(urls: string[], timeoutMs = 5000): Promise<WebPageExtractResult[]> {
    if (!Array.isArray(urls) || urls.length === 0) {
      return [];
    }

    // Limit to max 4 URLs per inspection pass
    const slice = urls.slice(0, 4);
    const results: WebPageExtractResult[] = [];

    // Attempt Tavily Extract if API key configured
    const apiKey = process.env.TAVILY_API_KEY?.trim();
    if (apiKey && apiKey.length > 5) {
      try {
        const controller = new AbortController();
        const tid = setTimeout(() => controller.abort(), timeoutMs);

        const resp = await fetch(this.EXTRACT_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ api_key: apiKey, urls: slice }),
          signal: controller.signal,
        });
        clearTimeout(tid);

        if (resp.ok) {
          const data = await resp.json();
          if (Array.isArray(data.results)) {
            for (const item of data.results) {
              const check = this.validateExternalUrl(item.url);
              const cleanContent = (item.raw_content || item.content || '')
                .replace(/<[^>]+>/g, ' ')
                .replace(/\s+/g, ' ')
                .trim()
                .slice(0, 1500);

              results.push({
                url: item.url,
                domain: check.domain,
                content: cleanContent,
                accessible: cleanContent.length > 20,
                authoritative: this.isAuthoritativeDomain(check.domain),
                error: cleanContent.length > 20 ? undefined : 'No content extracted',
              });
            }
          }
          if (Array.isArray(data.failed_results)) {
            for (const fail of data.failed_results) {
              results.push({
                url: fail.url,
                content: '',
                accessible: false,
                error: fail.error || 'Failed to access webpage content',
              });
            }
          }
        }
      } catch {
        // Fallback to direct inspection
      }
    }

    // For any URLs not covered by Tavily extract, perform safe direct inspection
    for (const rawUrl of slice) {
      if (results.some((r) => r.url === rawUrl)) continue;

      const validation = this.validateExternalUrl(rawUrl);
      if (!validation.valid || !validation.url) {
        results.push({
          url: rawUrl,
          content: '',
          accessible: false,
          error: validation.error || 'Invalid URL',
        });
        continue;
      }

      try {
        const controller = new AbortController();
        const tid = setTimeout(() => controller.abort(), 3500);

        const resp = await fetch(validation.url, {
          method: 'GET',
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 JexaResearchBot/1.0',
            'Accept': 'text/html,application/xhtml+xml,text/plain',
          },
          signal: controller.signal,
        });
        clearTimeout(tid);

        if (!resp.ok) {
          results.push({
            url: validation.url,
            domain: validation.domain,
            content: '',
            accessible: false,
            statusCode: resp.status,
            error: `HTTP ${resp.status} ${resp.statusText}`,
          });
          continue;
        }

        const html = await resp.text();
        const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
        const title = titleMatch ? titleMatch[1].trim() : undefined;

        // Clean HTML, strip scripts and styles
        const textContent = html
          .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ')
          .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ')
          .replace(/<noscript\b[^<]*(?:(?!<\/noscript>)<[^<]*)*<\/noscript>/gi, ' ')
          .replace(/<[^>]+>/g, ' ')
          .replace(/&nbsp;/g, ' ')
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 1500);

        const isAcc = textContent.length > 30;
        results.push({
          url: validation.url,
          title,
          domain: validation.domain,
          content: isAcc ? textContent : '',
          accessible: isAcc,
          authoritative: this.isAuthoritativeDomain(validation.domain),
          error: isAcc ? undefined : 'Page content was empty or protected by anti-bot verification',
        });
      } catch (err: any) {
        results.push({
          url: validation.url,
          domain: validation.domain,
          content: '',
          accessible: false,
          error: err.name === 'AbortError' ? 'Page request timed out' : `Connection error: ${err.message}`,
        });
      }
    }

    return results;
  }
}
