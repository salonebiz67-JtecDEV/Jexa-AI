/**
 * Response cleaner and normalizer for JEXA AI output.
 * Fixes raw JSON envelopes, escaped slashes/backslashes, runaway escape characters,
 * unfinished markdown, and unwanted repetitive greeting loops.
 */

export interface CleanResponseOptions {
  isFirstTurn?: boolean;
  userAskedIdentity?: boolean;
}

export function cleanAndNormalizeResponseContent(
  raw: string,
  options: CleanResponseOptions = {}
): string {
  if (typeof raw !== 'string' || !raw) {
    return '';
  }

  let text = raw.trim();

  // 1. Unwrap raw JSON envelopes or markdown-wrapped JSON objects
  text = unwrapJsonEnvelope(text);

  // 2. Fix JSON escaping artifacts & runaway backslashes/slashes
  text = normalizeEscapesAndSlashes(text);

  // 3. Remove unwanted repetitive robotic greetings unless user asked for identity or first turn
  if (!options.isFirstTurn && !options.userAskedIdentity) {
    text = cleanRepetitiveGreeting(text);
  }

  // 4. Repair unclosed code blocks (e.g. streaming chunks or cutoff responses)
  text = repairUnclosedMarkdown(text);

  return text.trim();
}

/**
 * Detects if the model returned raw JSON or a JSON code fence and extracts the inner message text.
 */
function unwrapJsonEnvelope(input: string): string {
  let target = input.trim();

  // Check for ```json { ... } ``` or ``` { ... } ```
  const codeBlockMatch = target.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (codeBlockMatch) {
    const candidate = codeBlockMatch[1].trim();
    if (candidate.startsWith('{') && candidate.endsWith('}')) {
      target = candidate;
    }
  }

  // Check if string is a raw JSON object
  if (target.startsWith('{') && target.endsWith('}')) {
    try {
      const parsed = JSON.parse(target);
      if (typeof parsed === 'object' && parsed !== null) {
        // Look for common text/response fields
        const possibleKeys = ['response', 'message', 'content', 'text', 'answer', 'reply', 'output'];
        for (const key of possibleKeys) {
          if (typeof parsed[key] === 'string' && parsed[key].trim()) {
            return parsed[key].trim();
          }
        }
        // If it's a ChatMessage-like structure { role: 'assistant', content: '...' }
        if (parsed.role && typeof parsed.content === 'string') {
          return parsed.content.trim();
        }
      }
    } catch {
      // Not valid JSON, keep as is
    }
  }

  return input;
}

/**
 * Normalizes JSON-escaped slashes, runaway backslashes, and literal escaped newlines.
 */
function normalizeEscapesAndSlashes(input: string): string {
  let res = input;

  // Unescape forward slashes escaped by JSON serializers: \/ -> /
  // e.g. https:\/\/example.com -> https://example.com, and\/or -> and/or
  res = res.replace(/\\\//g, '/');

  // Collapse 3 or more repeated backslashes into a single clean escape (or double for code)
  res = res.replace(/\\{3,}/g, '\\\\');

  // Collapse runaway forward slashes that are not part of protocols (http://, file://) or comments (//)
  // e.g. /////// -> //
  res = res.replace(/(?<!https?:|file:)\/{3,}/g, '//');

  // If the model output raw literal \n and \r\n without parsing (when string was double escaped)
  if (!res.includes('\n') && (res.includes('\\n') || res.includes('\\r\\n'))) {
    res = res.replace(/\\r\\n/g, '\n').replace(/\\n/g, '\n');
  }

  // Unescape literal escaped quotes if present throughout the body
  if (res.includes('\\"') && !res.includes('```')) {
    res = res.replace(/\\"/g, '"');
  }

  return res;
}

/**
 * Strips robotic, repetitive greetings like "Hey John", "Hey Johnny", "Hello John",
 * or "I'm JEXA, your AI companion." from continuing conversation turns.
 */
function cleanRepetitiveGreeting(input: string): string {
  let cleaned = input.trim();

  // Pattern 1: Greeting + Name + Introduction
  // e.g. "Hey John! I'm JEXA, your AI companion. Here is the answer..."
  cleaned = cleaned.replace(
    /^(?:hey|hello|hi|greetings|yo)\s+(?:john|johnny|there|friend|bro)?[!.,\s]*(?:i(?:'m| am)\s+jexa(?:[^\n.!?]*)[.!?,]\s*)?/i,
    ''
  );

  // Pattern 2: Standalone introduction
  // e.g. "I'm JEXA, your AI companion powered by JOHNEY TEC."
  cleaned = cleaned.replace(
    /^i(?:'m| am)\s+jexa[,\s]+(?:your\s+(?:personal\s+)?ai\s+companion|powered\s+by\s+johney\s+tec)[^\n.!?]*[.!?\s]*/i,
    ''
  );

  // Pattern 3: "Hey John," or "Hello John," at the beginning
  cleaned = cleaned.replace(/^(?:hey|hello|hi)\s+(?:john|johnny)[!.,\s]*/i, '');

  return cleaned.trim() || input;
}

/**
 * Ensures code fences are properly paired so that markdown parsers do not render
 * the rest of the text as an unstyled/broken block.
 */
export function repairUnclosedMarkdown(input: string): string {
  const matches = input.match(/```/g);
  if (matches && matches.length % 2 !== 0) {
    // Odd number of backticks means there's an unclosed code block
    return `${input}\n\`\`\`\n`;
  }
  return input;
}
