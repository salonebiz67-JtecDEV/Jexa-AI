import { DatabaseService } from '../database/db-service';
import { AIProviderRegistry } from '../../../ai/providers/registry';

export class UserStyleLearner {
  /**
   * Evaluates user communication style every 10 user messages.
   * Runs in the background after message reply, silently skips on rate limits,
   * and saves or updates in place as ONE insight memory in preferences_settings.
   */
  public static async maybeLearnUserStyle(userId?: string): Promise<void> {
    try {
      // 1. Check message count
      const userMessageCount = await DatabaseService.getUserMessageCount(userId);
      if (userMessageCount <= 0 || userMessageCount % 10 !== 0) {
        return;
      }

      // 2. Fetch last 20 user messages
      const recentMessages = await DatabaseService.getRecentUserMessages(userId, 20);
      if (!recentMessages || recentMessages.length < 3) {
        return;
      }

      // 3. Resolve background AI provider (never chat model)
      const registry = AIProviderRegistry.getInstance();
      const provider = registry.getBackgroundTextProvider();
      if (!provider || typeof provider.generateResponse !== 'function') {
        return;
      }

      const formattedSample = recentMessages
        .map((msg, i) => `${i + 1}. "${msg.replace(/"/g, "'").slice(0, 300)}"`)
        .join('\n');

      const prompt = `Analyze these recent user messages and write a short, concise description (2-4 sentences max) of how this user communicates:
- Language mix (e.g., English, Krio, code-switching, other languages)
- Slang and colloquialisms used (e.g., casual slang, tech terms, none)
- Formality level (e.g., casual, direct, formal, concise)
- Typical message length and cadence
- Humor and tone (e.g., witty, serious, playful, matter-of-fact)
- Emoji use (frequent, rare, none, or explicit dislike)
- Dislikes or communication preferences (if noted)

USER MESSAGES:
${formattedSample}

Output ONLY the concise description of how this user communicates. Do NOT include markdown headers, bullet lists, or conversational preamble.`;

      let analysis = '';
      try {
        const response = await provider.generateResponse({
          systemPrompt: 'You are an expert conversational linguist analyzing communication style. Output only the concise analytical description.',
          messages: [
            {
              role: 'user',
              content: prompt,
            },
          ],
          temperature: 0.3,
          maxTokens: 300,
        });
        analysis = (response.content || '').trim();
      } catch (callErr: any) {
        const errStr = String(callErr?.message || callErr?.details || callErr || '').toLowerCase();
        const isRateLimit =
          callErr?.status === 429 ||
          callErr?.statusCode === 429 ||
          callErr?.code === 429 ||
          callErr?.code === 'RESOURCE_EXHAUSTED' ||
          /rate[-_\s]?limit|quota|resource_exhausted|too\s+many\s+requests/i.test(errStr);

        if (isRateLimit) {
          // Skip silently on rate-limit errors
          return;
        }
        console.warn('[UserStyleLearner] AI provider call notice:', callErr.message);
        return;
      }

      if (!analysis || analysis.length < 15) {
        return;
      }

      // Clean up any extraneous quotes or leading labels
      const cleanFact = `Communication style: ${analysis.replace(/^(?:communication style|how this user talks|user communication style):\s*/i, '').trim()}`;

      // 4. Save or update ONE insight memory in preferences_settings (never duplicate)
      const existingMemories = await DatabaseService.getMemories(userId);
      const existingStyleMem = existingMemories.find(
        (m) =>
          m.category === 'preferences_settings' &&
          m.fact.toLowerCase().startsWith('communication style:')
      );

      if (existingStyleMem) {
        await DatabaseService.updateMemory(
          existingStyleMem.id,
          {
            fact: cleanFact,
            memoryType: 'insight',
            confidence: 0.95,
          },
          userId
        );
      } else {
        await DatabaseService.createMemory(
          {
            category: 'preferences_settings',
            fact: cleanFact,
            memoryType: 'insight',
            confidence: 0.95,
          },
          userId
        );
      }
    } catch (e: any) {
      // Background process must never fail the application or throw uncaught errors
      const errStr = String(e?.message || e || '').toLowerCase();
      if (!/rate[-_\s]?limit|quota/i.test(errStr)) {
        console.warn('[UserStyleLearner] Background user style processing error:', e.message);
      }
    }
  }
}
