import { ChatMessage } from '../../shared/types/chat';

export class ShortTermMemoryBuffer {
  private windowSize: number;

  constructor(windowSize: number = 10) {
    this.windowSize = windowSize;
  }

  public getSlidingWindow(messages: ChatMessage[]): ChatMessage[] {
    if (messages.length <= this.windowSize) {
      return messages;
    }
    return messages.slice(messages.length - this.windowSize);
  }

  public summarizeContext(messages: ChatMessage[]): string {
    if (messages.length === 0) return '';
    const userTopics = messages
      .filter((m) => m.role === 'user')
      .slice(-3)
      .map((m) => m.content.slice(0, 80));
    return userTopics.length > 0 ? `Recent dialogue themes: ${userTopics.join(' | ')}` : '';
  }
}
