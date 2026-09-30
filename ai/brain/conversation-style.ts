export interface StyleConfig {
  useMarkdown: boolean;
  bulletLimit: number;
  emojiDensity: 'none' | 'subtle' | 'frequent';
  pacing: 'brisk' | 'balanced' | 'deliberate';
}

export const DEFAULT_STYLE_CONFIG: StyleConfig = {
  useMarkdown: true,
  bulletLimit: 5,
  emojiDensity: 'subtle',
  pacing: 'balanced',
};

export function getStyleInstructions(config: StyleConfig = DEFAULT_STYLE_CONFIG): string {
  const parts: string[] = [];

  if (config.useMarkdown) {
    parts.push('Use clean Markdown formatting: bold for emphasis, lists for structured multi-point ideas, code blocks for technical syntax.');
  } else {
    parts.push('Use plain prose with clean sentence breaks. Avoid markdown symbols or asterisks.');
  }

  if (config.emojiDensity === 'subtle') {
    parts.push('Use emojis sparingly and naturally, only where they add genuine emotional nuance (at most one per message turn).');
  } else if (config.emojiDensity === 'none') {
    parts.push('Do not use emojis.');
  }

  parts.push(`Avoid walls of unbroken text; keep paragraphs to 2-3 focused sentences.`);
  return parts.join('\n');
}
