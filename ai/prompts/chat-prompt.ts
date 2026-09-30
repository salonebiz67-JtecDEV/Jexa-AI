export function formatChatTurn(userMessage: string, previousContextSummary?: string): string {
  if (!previousContextSummary) {
    return userMessage;
  }
  return `[Context Note: ${previousContextSummary}]\n\n${userMessage}`;
}
