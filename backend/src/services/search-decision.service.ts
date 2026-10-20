import { ITextAIProvider } from '../../../ai/providers/text-provider.interface';

export interface SearchDecision {
  shouldSearch: boolean;
  query: string;
  reason?: string;
  category:
    | 'manual_user_toggle'
    | 'sierra_leone_local'
    | 'explicit_search'
    | 'current_events'
    | 'sports_scores'
    | 'live_rates'
    | 'new_products'
    | 'current_laws'
    | 'templates_or_guidelines'
    | 'technical_docs'
    | 'ai_decided_search'
    | 'none';
  isManual?: boolean;
}

export class SearchDecisionService {
  /**
   * Evaluates incoming user message to intelligently decide whether live web search is required.
   * Leverages fast heuristic rules for instant decisions and the active AI provider for nuanced queries.
   */
  public static async evaluate(
    message: string,
    userContext?: { location?: string; timezone?: string; userName?: string },
    aiProvider?: ITextAIProvider,
    recentDialogue?: string
  ): Promise<SearchDecision> {
    const raw = (message || '').trim();
    if (!raw) {
      return { shouldSearch: false, query: '', category: 'none', reason: 'Empty message', isManual: false };
    }

    // 1. Manual Web Search toggle from composer Plus/attachments menu
    const manualToggleMatch = this.checkManualToggle(raw);
    if (manualToggleMatch.isManual) {
      return {
        shouldSearch: true,
        query: manualToggleMatch.query,
        category: 'manual_user_toggle',
        reason: 'User explicitly enabled Search Web in message composer',
        isManual: true,
      };
    }

    const lower = raw.toLowerCase();

    // 2. Negative rules: Questions that should NEVER trigger web search
    if (this.isConversationalOrGreeting(lower)) {
      return { shouldSearch: false, query: '', category: 'none', reason: 'Greeting or casual chit-chat', isManual: false };
    }

    if (this.isIdentityOrCapabilities(lower)) {
      return { shouldSearch: false, query: '', category: 'none', reason: 'Assistant identity or capability question', isManual: false };
    }

    if (this.isMemoryOrPreference(lower)) {
      return { shouldSearch: false, query: '', category: 'none', reason: 'Memory or preference statement', isManual: false };
    }

    if (this.isSystemDiagnostics(lower)) {
      return { shouldSearch: false, query: '', category: 'none', reason: 'Internal system diagnostics query answered via telemetry', isManual: false };
    }

    if (this.isSimpleMathOrConversion(lower)) {
      return { shouldSearch: false, query: '', category: 'none', reason: 'Simple arithmetic or unit conversion', isManual: false };
    }

    if (this.isCreativeWritingOrBrainstorming(lower)) {
      return { shouldSearch: false, query: '', category: 'none', reason: 'Creative writing, storytelling, or brainstorming', isManual: false };
    }

    if (this.isPureCodingSyntaxOrAlgo(lower)) {
      return { shouldSearch: false, query: '', category: 'none', reason: 'General coding logic, syntax, or algorithm question', isManual: false };
    }

    // 3. Sierra Leone Local Search & EDSA Utilities: Prioritize Sierra Leone and EDSA
    const slMatch = this.checkSierraLeoneAndEDSA(lower, raw, userContext);
    if (slMatch.matches) {
      return {
        shouldSearch: true,
        query: slMatch.query,
        category: 'sierra_leone_local',
        reason: 'Sierra Leone local utility (EDSA), electricity outage, or official announcement',
        isManual: false,
      };
    }

    // 4. Explicit search commands
    const explicitMatch = this.extractExplicitSearch(raw);
    if (explicitMatch) {
      let finalQuery = explicitMatch;
      // If the query is just a pronoun/reference (e.g. "that", "it", "that online", "this"), resolve from recent dialogue
      if (recentDialogue && /^(?:that|it|this|them|what\s+we\s+discussed)(?:\s+(?:online|up|for\s+me))?$/i.test(explicitMatch.trim())) {
        const dialogueLines = recentDialogue.split('\n').filter(Boolean);
        const lastRelevantLine = dialogueLines.slice().reverse().find((l) => !/^(?:ASSISTANT:\s*(?:I can check|Sure|Okay|Let me))/i.test(l)) || dialogueLines[0] || '';
        const topic = lastRelevantLine.replace(/^[A-Z]+:\s*/, '').slice(0, 120).trim();
        if (topic.length > 3) {
          finalQuery = this.cleanQuery(topic);
        }
      }

      return {
        shouldSearch: true,
        query: finalQuery,
        category: 'explicit_search',
        reason: 'User explicitly asked to research, look up, verify, find sources, or search online',
        isManual: false,
      };
    }

    // 5. Sports & Live match results
    const sportsMatch = this.checkSportsAndScores(lower, raw);
    if (sportsMatch.matches) {
      return {
        shouldSearch: true,
        query: sportsMatch.query,
        category: 'sports_scores',
        reason: 'Live sports score, match result, or tournament update requested',
        isManual: false,
      };
    }

    // 6. Live News & Current events
    const newsMatch = this.checkNewsAndCurrentEvents(lower, raw);
    if (newsMatch.matches) {
      return {
        shouldSearch: true,
        query: newsMatch.query,
        category: 'current_events',
        reason: 'Current news, today\'s events, or real-time event updates requested',
        isManual: false,
      };
    }

    // 7. Real-time rates, crypto, stocks, or weather
    const liveRatesMatch = this.checkLiveRatesOrWeather(lower, raw);
    if (liveRatesMatch.matches) {
      return {
        shouldSearch: true,
        query: liveRatesMatch.query,
        category: 'live_rates',
        reason: 'Real-time financial rates, crypto/stock prices, or weather forecast requested',
        isManual: false,
      };
    }

    // 8. Newly released products, hardware, games, or media
    const productMatch = this.checkNewlyReleasedProducts(lower, raw);
    if (productMatch.matches) {
      return {
        shouldSearch: true,
        query: productMatch.query,
        category: 'new_products',
        reason: 'Newly released product, launch date, or hardware announcement requested',
        isManual: false,
      };
    }

    // 9. Current laws, legal regulations, policy guidelines, templates
    const legalMatch = this.checkLegalOrTemplates(lower, raw);
    if (legalMatch.matches) {
      return {
        shouldSearch: true,
        query: legalMatch.query,
        category: 'templates_or_guidelines',
        reason: 'Current laws, regulatory frameworks, compliance guidelines, or templates requested',
        isManual: false,
      };
    }

    // 10. Recent technical releases, documentation, or changelogs
    const techDocsMatch = this.checkTechnicalDocsOrReleases(lower, raw);
    if (techDocsMatch.matches) {
      return {
        shouldSearch: true,
        query: techDocsMatch.query,
        category: 'technical_docs',
        reason: 'Recent technical documentation, release notes, or library versions requested',
        isManual: false,
      };
    }

    // 10b. Follow-up search resolving references from recent dialogue
    if (recentDialogue && /(?:search\s+for\s+that|look\s+that\s+up|google\s+that|check\s+if\s+that's\s+true|verify\s+that\s+online|find\s+out\s+more\s+about\s+that|what\s+about\s+that)/i.test(lower)) {
      const dialogueLines = recentDialogue.split('\n').filter(Boolean);
      const lastLine = dialogueLines[dialogueLines.length - 1] || '';
      const topicKeywords = lastLine.replace(/^[A-Z]+:\s*/, '').slice(0, 100).trim();
      if (topicKeywords.length > 3) {
        return {
          shouldSearch: true,
          query: this.cleanQuery(topicKeywords),
          category: 'explicit_search',
          reason: 'User requested search on the topic discussed in previous dialogue turn',
          isManual: false,
        };
      }
    }

    // 11. AI Provider Decision: For ambiguous or factual inquiries, ask active AI model
    if (aiProvider && aiProvider.isConfigured && aiProvider.providerType !== 'development_mock') {
      try {
        const aiDecision = await this.classifyWithAIProvider(raw, aiProvider, recentDialogue);
        if (aiDecision) {
          return aiDecision;
        }
      } catch (err: any) {
        console.warn('[SearchDecisionService] AI provider classification bypassed:', err.message);
      }
    }

    // 12. Secondary heuristic check for general factual questions about current world status
    const statusInquiryMatch = this.checkCurrentStatusInquiry(lower, raw);
    if (statusInquiryMatch.matches) {
      return {
        shouldSearch: true,
        query: statusInquiryMatch.query,
        category: 'current_events',
        reason: 'Automatic search triggered for up-to-date real-world facts or status inquiry',
        isManual: false,
      };
    }

    // Default: Direct AI answer without search
    return {
      shouldSearch: false,
      query: '',
      category: 'none',
      reason: 'General knowledge inquiry answerable directly without live search',
      isManual: false,
    };
  }

  // --- Fast Classifier with AI Provider ---

  private static async classifyWithAIProvider(
    rawMessage: string,
    aiProvider: ITextAIProvider,
    recentDialogue?: string
  ): Promise<SearchDecision | null> {
    const cleanMsg = this.cleanQuery(rawMessage);
    if (cleanMsg.length < 5) return null;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1600);

    try {
      const todayStr = new Date().toISOString().split('T')[0];
      const classifierPrompt = `You are the Search Classifier & Query Formulation Engine for JEXA AI.
Decide if this user message requires live web search to answer factually and up-to-date, or if it can be answered using general baseline knowledge.
- search=true: current news, recent events (2024-2026), changing facts, real-time prices/rates/weather, live sports, current officeholders, status of recent laws, new products/versions, Sierra Leone/EDSA utilities.
- search=false: ordinary chit-chat, creative writing, storytelling, brainstorming, coding algorithms, math, personal memory statements.
- QUERY FORMULATION: If search is needed, translate imperfect English, slang, typos (e.g. 'wat', 'wen', 'luk up', 'projek'), or ambiguous phrases into an effective, clean, high-signal web search query. Resolve references ('that', 'it', 'what we discussed') using the Recent Context.

User message: "${cleanMsg}"${recentDialogue ? `\nRecent Context: "${recentDialogue.slice(-300)}"` : ''}
Current date: ${todayStr}

Respond ONLY with a valid JSON object in this exact schema:
{"search": true|false, "query": "concise effective search query without quotes", "reason": "short explanation"}`;

      const responsePromise = aiProvider.generateResponse({
        systemPrompt: classifierPrompt,
        messages: [{ role: 'user', content: cleanMsg }],
        temperature: 0.1,
        maxTokens: 80,
      });

      const response = await Promise.race([
        responsePromise,
        new Promise<never>((_, reject) => {
          controller.signal.addEventListener('abort', () => reject(new Error('AI decision timed out')));
        }),
      ]);

      clearTimeout(timeout);

      const text = response.content?.trim() || '';
      const jsonMatch = text.match(/\{[\s\S]*?\}/);
      if (!jsonMatch) return null;

      const parsed = JSON.parse(jsonMatch[0]);
      if (typeof parsed.search === 'boolean') {
        if (parsed.search) {
          const finalQuery = (typeof parsed.query === 'string' && parsed.query.trim())
            ? this.cleanQuery(parsed.query)
            : cleanMsg;
          return {
            shouldSearch: true,
            query: finalQuery,
            category: 'ai_decided_search',
            reason: parsed.reason || 'AI decided live web research is required for up-to-date facts',
            isManual: false,
          };
        } else {
          return {
            shouldSearch: false,
            query: '',
            category: 'none',
            reason: parsed.reason || 'AI determined general knowledge is sufficient',
            isManual: false,
          };
        }
      }
    } catch {
      // Timeout or parse failure - gracefully fallback to heuristics
    } finally {
      clearTimeout(timeout);
    }

    return null;
  }

  // --- Negative Rule Helpers ---

  private static checkManualToggle(text: string): { isManual: boolean; query: string } {
    if (/\[web\s+search\s+requested\]/i.test(text)) {
      const clean = text.replace(/\[web\s+search\s+requested\]/gi, '').trim();
      return { isManual: true, query: this.cleanQuery(clean) };
    }
    return { isManual: false, query: '' };
  }

  private static isConversationalOrGreeting(text: string): boolean {
    return /^(hi|hello|hey|yo|howdy|good\s+(morning|afternoon|evening|day)|how\s+are\s+you|what's\s+up|sup|jexa|hey\s+jexa|yo\s+jexa|hi\s+jexa|jexa\s+bro|what's\s+cooking)\b[!.?]*$/i.test(text.trim());
  }

  private static isIdentityOrCapabilities(text: string): boolean {
    return /^(who\s+are\s+you|what\s+is\s+your\s+name|what\s+can\s+you\s+do|tell\s+me\s+about\s+yourself|what\s+are\s+your\s+features|who\s+made\s+you)\b/i.test(text.trim());
  }

  private static isMemoryOrPreference(text: string): boolean {
    return /^(remember\s+that|save\s+(this\s+)?to\s+memory|my\s+name\s+is|i\s+prefer|note\s+that|don't\s+forget|my\s+favorite\s+[a-z0-9_\s]+\s+is)\b/i.test(text.trim());
  }

  private static isSystemDiagnostics(text: string): boolean {
    return /(check\s+all\s+systems|system\s+health|run\s+diagnostics|check\s+system\s+status|diagnose\s+system|are\s+all\s+systems\s+working|full\s+system\s+check)\b/i.test(text.trim());
  }

  private static isSimpleMathOrConversion(text: string): boolean {
    return /^(\d+\s*[\+\-\*\/]\s*\d+|what\s+is\s+\d+\s*[\+\-\*\/]|calculate\s+\d+|convert\s+\d+\s*(miles|km|meters|feet|celsius|fahrenheit|kg|lbs))\b/i.test(text.trim());
  }

  private static isCreativeWritingOrBrainstorming(text: string): boolean {
    return /^(write|generate|create|tell)\s+(me\s+)?(a|an)?\s*(poem|story|bedtime\s+story|song|joke|essay|rhyme|haiku|brainstorm\s+(names|ideas))\b/i.test(text.trim());
  }

  private static isPureCodingSyntaxOrAlgo(text: string): boolean {
    return /^(write|code|create|implement|debug)\s+(a|an)?\s*(function|method|class|algorithm|regex|sql\s+query|loop)\s+(to|that|for)\s+[a-z0-9_\s]+$/i.test(text.trim()) &&
      !/(latest|recent|current|2025|2026|tavily|supabase|groq|gemini|next\.js|react\s+19)/i.test(text);
  }

  // --- Positive Rule Helpers ---

  private static extractExplicitSearch(text: string): string | null {
    const patterns = [
      /(?:search|browse|look\s*up|google|find\s+online|research|verify\s+online)\s+(?:the\s+web\s+for|the\s+internet\s+for|online\s+for|for)?\s*(.+)/i,
      /(?:can\s+you\s+)?(?:search|find\s+sources\s+for|look\s*up)\s+(.+)/i,
      /(?:verify|check)\s+(?:online|on\s+the\s+web|sources\s+for)\s+(.+)/i,
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
      'cricket score', 'tennis score', 'grand slam', 'ufc', 'formula 1', 'f1 result'
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
      'current situation', 'latest updates on', 'latest update on',
      'what is going on with', 'news today'
    ];

    const hasNews = newsKeywords.some((kw) => lower.includes(kw));
    const hasTemporal = /(today|this\s+week|this\s+month|2025|2026|recently|currently|right\s+now|yesterday)/i.test(lower);

    if (hasNews || (hasTemporal && /(news|election|summit|earthquake|war|treaty|announcement|launch|scandal|protest|policy|crisis)/i.test(lower))) {
      return { matches: true, query: this.cleanQuery(raw) };
    }
    return { matches: false, query: '' };
  }

  private static checkLiveRatesOrWeather(lower: string, raw: string): { matches: boolean; query: string } {
    const isRates = /(stock\s+price|crypto\s+price|bitcoin\s+price|ethereum\s+price|exchange\s+rate|market\s+price\s+of|gas\s+price|fuel\s+price|inflation\s+rate)/i.test(lower);
    const isWeather = /(weather\s+in|weather\s+today|forecast\s+for|temperature\s+in|is\s+it\s+raining\s+in)/i.test(lower);

    if (isRates || isWeather) {
      return { matches: true, query: this.cleanQuery(raw) };
    }
    return { matches: false, query: '' };
  }

  private static checkNewlyReleasedProducts(lower: string, raw: string): { matches: boolean; query: string } {
    const isProductRelease = /(when\s+is\s+[a-z0-9_\s]+\s+released|release\s+date\s+of|launch\s+date\s+of|when\s+does\s+[a-z0-9_\s]+\s+come\s+out|is\s+[a-z0-9_\s]+\s+out\s+yet|new\s+iphone|new\s+galaxy|rtx\s+50\d0|ps5\s+pro|switch\s+2|gta\s+6|movies\s+in\s+theaters\s+now)/i.test(lower);
    if (isProductRelease) {
      return { matches: true, query: this.cleanQuery(raw) };
    }
    return { matches: false, query: '' };
  }

  private static checkLegalOrTemplates(lower: string, raw: string): { matches: boolean; query: string } {
    const legalPatterns = [
      'terms and conditions template',
      'privacy policy template',
      'website legal guidelines',
      'terms of service template',
      'cookie policy guideline',
      'gdpr compliance checklist',
      'eu ai act',
      'new tax law',
      'current law on',
      'eula template',
      'disclaimer template'
    ];

    const matches = legalPatterns.some((pattern) => lower.includes(pattern));
    if (matches) {
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

  private static checkSierraLeoneAndEDSA(
    lower: string,
    raw: string,
    userContext?: { location?: string; timezone?: string; userName?: string }
  ): { matches: boolean; query: string } {
    const hasEDSA = /\bedsa\b/i.test(lower) || lower.includes('electricity distribution and supply authority');
    const isSierraLeoneLocation = Boolean(
      userContext?.location && /sierra\s+leone|freetown|salone/i.test(userContext.location)
    );
    const mentionsSierraLeone = /(sierra\s+leone|freetown|salone|bo\s+city|makeni|kenema|kono|karpowership|bumbuna|egtc|npa)/i.test(lower);
    const mentionsOutageOrPower = /(power\s+outage|blackout|electricity\s+outage|light\s+off|no\s+light|power\s+cut|load\s+shedding|current\s+off|electricity\s+status|power\s+status|why\s+is\s+there\s+no\s+power|why\s+did\s+power\s+go\s+off)/i.test(lower);
    const mentionsGovOrLocalIssues = /(government\s+announcement|ministry\s+of\s+energy|state\s+house|parliament|fuel\s+price|water\s+shortage|guma\s+valley|public\s+notice)/i.test(lower);

    // Case 1: EDSA mentioned directly
    if (hasEDSA) {
      // Disambiguate to Sierra Leone EDSA to avoid confusion with EDSA highway/revolution in Manila, Philippines
      const clean = this.cleanQuery(raw).replace(/\bedsa\b/gi, '').trim();
      const query = `EDSA Sierra Leone electricity outage news announcement ${clean}`.trim();
      return { matches: true, query };
    }

    // Case 2: Sierra Leone context + Outage or Power issue
    if ((mentionsSierraLeone || isSierraLeoneLocation) && mentionsOutageOrPower) {
      const clean = this.cleanQuery(raw);
      const query = `EDSA Sierra Leone electricity blackout power outage update ${clean}`.trim();
      return { matches: true, query };
    }

    // Case 3: Sierra Leone local announcements or government notices
    if (mentionsSierraLeone && (mentionsGovOrLocalIssues || mentionsOutageOrPower)) {
      const clean = this.cleanQuery(raw);
      const query = `Sierra Leone official announcement news ${clean}`.trim();
      return { matches: true, query };
    }

    return { matches: false, query: '' };
  }

  private static checkCurrentStatusInquiry(lower: string, raw: string): { matches: boolean; query: string } {
    const isCurrentInquiry = /(who\s+is\s+the\s+current|what\s+is\s+the\s+current\s+status\s+of|did\s+[a-z0-9_\s]+\s+happen|has\s+[a-z0-9_\s]+\s+been\s+announced|is\s+[a-z0-9_\s]+\s+still\s+in\s+effect|latest\s+on)\b/i.test(lower);
    if (isCurrentInquiry) {
      return { matches: true, query: this.cleanQuery(raw) };
    }
    return { matches: false, query: '' };
  }

  public static cleanQuery(query: string): string {
    let q = query
      .replace(/\[web\s+search\s+requested\]/gi, '')
      .replace(/^(?:can\s+u\s+|can\s+you\s+)?(?:plz\s+|please\s+)?(?:search\s+(?:the\s+web\s+|the\s+internet\s+|online\s+)?for|search|find|look\s*up|luk\s+up|browse\s+for)\s+/i, '')
      .replace(/^(?:wat\s+is\s+d\s+|wat\s+is\s+|wats\s+d\s+|wats\s+|what\s+is\s+the\s+latest|what\s+are\s+the\s+latest|tell\s+me\s+about\s+the\s+latest|tel\s+me\s+bout\s+|tell\s+me\s+about\s+|what\s+is\s+|what\s+are\s+|who\s+iz\s+)\s*/i, '')
      .replace(/^(?:the\s+latest|the\s+recent|the\s+current)\s+/i, '')
      .replace(/\b(?:dat)\b/gi, 'that')
      .replace(/\b(?:wit)\b/gi, 'with')
      .replace(/[?!.]+$/, '')
      .trim();

    return q || query.trim();
  }
}
