export interface SearchDecision {
  shouldSearch: boolean;
  query: string;
  reason?: string;
  category:
    | 'explicit_search'
    | 'current_events'
    | 'sports_scores'
    | 'live_rates'
    | 'templates_or_guidelines'
    | 'technical_docs'
    | 'none';
}

export class SearchDecisionService {
  /**
   * Evaluates incoming user message to intelligently decide whether live web search is required.
   */
  public static evaluate(message: string): SearchDecision {
    const raw = (message || '').trim();
    if (!raw) {
      return { shouldSearch: false, query: '', category: 'none', reason: 'Empty message' };
    }

    const lower = raw.toLowerCase();

    // 1. Negative rules: Pure conversational, math, coding syntax, memory, or greetings
    if (this.isConversationalOrGreeting(lower)) {
      return { shouldSearch: false, query: '', category: 'none', reason: 'Greeting or casual chit-chat' };
    }

    if (this.isIdentityOrCapabilities(lower)) {
      return { shouldSearch: false, query: '', category: 'none', reason: 'Assistant identity or capability question' };
    }

    if (this.isMemoryOrPreference(lower)) {
      return { shouldSearch: false, query: '', category: 'none', reason: 'Memory or preference statement' };
    }

    if (this.isSimpleMathOrConversion(lower)) {
      return { shouldSearch: false, query: '', category: 'none', reason: 'Simple arithmetic or unit conversion' };
    }

    if (this.isPureCodingSyntaxOrAlgo(lower)) {
      return { shouldSearch: false, query: '', category: 'none', reason: 'General coding logic/algorithm question' };
    }

    // 2. Explicit search commands: Highest priority
    const explicitMatch = this.extractExplicitSearch(raw);
    if (explicitMatch) {
      return {
        shouldSearch: true,
        query: explicitMatch,
        category: 'explicit_search',
        reason: 'User explicitly requested live web search',
      };
    }

    // 3. Sports & Live match results
    const sportsMatch = this.checkSportsAndScores(lower, raw);
    if (sportsMatch.matches) {
      return {
        shouldSearch: true,
        query: sportsMatch.query,
        category: 'sports_scores',
        reason: 'Live sports score or match update requested',
      };
    }

    // 4. Live News & Current events
    const newsMatch = this.checkNewsAndCurrentEvents(lower, raw);
    if (newsMatch.matches) {
      return {
        shouldSearch: true,
        query: newsMatch.query,
        category: 'current_events',
        reason: 'Current news or real-time event information requested',
      };
    }

    // 5. Legal guidelines, terms and conditions templates (as cited in prompt requirements)
    const legalMatch = this.checkLegalOrTemplates(lower, raw);
    if (legalMatch.matches) {
      return {
        shouldSearch: true,
        query: legalMatch.query,
        category: 'templates_or_guidelines',
        reason: 'Real-world legal guidelines, policies, or templates requested',
      };
    }

    // 6. Real-time rates, crypto, stocks, or weather
    const liveRatesMatch = this.checkLiveRatesOrWeather(lower, raw);
    if (liveRatesMatch.matches) {
      return {
        shouldSearch: true,
        query: liveRatesMatch.query,
        category: 'live_rates',
        reason: 'Real-time financial price or weather forecast requested',
      };
    }

    // 7. Recent technical releases, documentation, or changelogs
    const techDocsMatch = this.checkTechnicalDocsOrReleases(lower, raw);
    if (techDocsMatch.matches) {
      return {
        shouldSearch: true,
        query: techDocsMatch.query,
        category: 'technical_docs',
        reason: 'Recent technical documentation, release notes, or library versions requested',
      };
    }

    // Default: Direct AI answer without search
    return {
      shouldSearch: false,
      query: '',
      category: 'none',
      reason: 'Standard knowledge inquiry answerable directly',
    };
  }

  // --- Helper Methods ---

  private static isConversationalOrGreeting(text: string): boolean {
    return /^(hi|hello|hey|yo|howdy|good\s+(morning|afternoon|evening|day)|how\s+are\s+you|what's\s+up|sup)\b[!.?]*$/i.test(text.trim());
  }

  private static isIdentityOrCapabilities(text: string): boolean {
    return /^(who\s+are\s+you|what\s+is\s+your\s+name|what\s+can\s+you\s+do|tell\s+me\s+about\s+yourself|what\s+are\s+your\s+features)\b/i.test(text.trim());
  }

  private static isMemoryOrPreference(text: string): boolean {
    return /^(remember\s+that|save\s+(this\s+)?to\s+memory|my\s+name\s+is|i\s+prefer|note\s+that|don't\s+forget)\b/i.test(text.trim());
  }

  private static isSimpleMathOrConversion(text: string): boolean {
    return /^(\d+\s*[\+\-\*\/]\s*\d+|what\s+is\s+\d+\s*[\+\-\*\/]|convert\s+\d+\s*(miles|km|meters|feet|celsius|fahrenheit))\b/i.test(text.trim());
  }

  private static isPureCodingSyntaxOrAlgo(text: string): boolean {
    // Queries asking to write or explain generic algorithmic problems
    return /^(write|code|create|implement|debug)\s+(a|an)?\s*(function|method|class|algorithm|regex|sql\s+query|loop)\s+(to|that|for)\s+[a-z0-9_\s]+$/i.test(text.trim()) &&
      !/(latest|recent|current|2025|2026|tavily|supabase|groq|gemini)/i.test(text);
  }

  private static extractExplicitSearch(text: string): string | null {
    const patterns = [
      /(?:search|browse|look\s*up|google|find\s+online)\s+(?:the\s+web\s+for|the\s+internet\s+for|online\s+for|for)?\s*(.+)/i,
      /(?:can\s+you\s+)?(?:search|find)\s+(.+)/i,
    ];

    for (const pat of patterns) {
      const match = text.match(pat);
      if (match && match[1]?.trim().length > 2) {
        return this.cleanQuery(match[1]);
      }
    }
    return null;
  }

  private static checkSportsAndScores(lower: string, raw: string): { matches: boolean; query: string } {
    const sportsKeywords = [
      'score', 'scores', 'match result', 'who won', 'game result',
      'football score', 'soccer score', 'premier league', 'champions league',
      'nba', 'nfl', 'super bowl', 'fifa', 'la liga', 'serie a', 'bundesliga',
      'cricket score', 'tennis score', 'grand slam', 'ufc'
    ];

    const hasSports = sportsKeywords.some((kw) => lower.includes(kw));
    const hasTemporal = /(today|yesterday|tonight|this\s+weekend|recent|latest|live|current)/i.test(lower);

    if (hasSports && (hasTemporal || lower.includes('vs') || lower.includes('against'))) {
      return { matches: true, query: this.cleanQuery(raw) };
    }
    return { matches: false, query: '' };
  }

  private static checkNewsAndCurrentEvents(lower: string, raw: string): { matches: boolean; query: string } {
    const newsKeywords = [
      'latest news', 'breaking news', 'current events', 'recent news',
      'headlines today', 'what happened today', 'what happened with',
      'current situation', 'latest updates on', 'latest update on'
    ];

    const hasNews = newsKeywords.some((kw) => lower.includes(kw));
    const hasTemporal = /(today|this\s+week|this\s+month|2025|2026|recently|currently|right\s+now)/i.test(lower);

    if (hasNews || (hasTemporal && /(news|election|summit|earthquake|war|treaty|announcement|launch|scandal)/i.test(lower))) {
      return { matches: true, query: this.cleanQuery(raw) };
    }
    return { matches: false, query: '' };
  }

  private static checkLegalOrTemplates(lower: string, raw: string): { matches: boolean; query: string } {
    // Specifically cited in prompt: "website legal guidelines, terms and conditions templates"
    const legalPatterns = [
      'terms and conditions template',
      'privacy policy template',
      'website legal guidelines',
      'terms of service template',
      'cookie policy guideline',
      'gdpr compliance checklist',
      'eula template',
      'disclaimer template'
    ];

    const matches = legalPatterns.some((pattern) => lower.includes(pattern));
    if (matches) {
      return { matches: true, query: this.cleanQuery(raw) };
    }
    return { matches: false, query: '' };
  }

  private static checkLiveRatesOrWeather(lower: string, raw: string): { matches: boolean; query: string } {
    const isRates = /(stock\s+price|crypto\s+price|bitcoin\s+price|ethereum\s+price|exchange\s+rate|market\s+price\s+of)/i.test(lower);
    const isWeather = /(weather\s+in|weather\s+today|forecast\s+for|temperature\s+in)/i.test(lower);

    if (isRates || isWeather) {
      return { matches: true, query: this.cleanQuery(raw) };
    }
    return { matches: false, query: '' };
  }

  private static checkTechnicalDocsOrReleases(lower: string, raw: string): { matches: boolean; query: string } {
    const isRecentTech = /(what\s+is\s+new\s+in|latest\s+version\s+of|release\s+notes\s+for|changelog\s+for|new\s+features\s+in)\s+[a-z0-9_\s\.\-]+/i.test(lower);
    if (isRecentTech) {
      return { matches: true, query: this.cleanQuery(raw) };
    }
    return { matches: false, query: '' };
  }

  private static cleanQuery(query: string): string {
    return query
      .replace(/^(can\s+you\s+)?(please\s+)?(search\s+(the\s+web\s+|the\s+internet\s+|online\s+)?for|search|find|look\s*up|browse\s+for)\s+/i, '')
      .replace(/^(what\s+is\s+the\s+latest|what\s+are\s+the\s+latest|tell\s+me\s+about\s+the\s+latest|what\s+is\s+|what\s+are\s+)\s*/i, '')
      .replace(/^(the\s+latest|the\s+recent|the\s+current)\s+/i, '')
      .replace(/[?!.]+$/, '')
      .trim();
  }
}
