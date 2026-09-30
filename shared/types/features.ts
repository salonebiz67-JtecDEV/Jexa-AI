export interface Project {
  id: string;
  name: string;
  description: string;
  conversationIds: string[];
  fileCount: number;
  updatedAt: string;
  color?: string;
}

export interface ImageItem {
  id: string;
  url: string;
  prompt: string;
  createdAt: string;
  aspectRatio: string;
  projectId?: string;
  dimensions?: string;
}

export interface ScheduleItem {
  id: string;
  title: string;
  frequency: string;
  time: string;
  active: boolean;
  nextRun: string;
  promptAction?: string;
}

export interface PluginItem {
  id: string;
  name: string;
  description: string;
  category: 'search' | 'generation' | 'productivity' | 'coding' | 'audio';
  icon: string;
  enabled: boolean;
}

export interface RemoteDevice {
  id: string;
  name: string;
  type: 'mobile' | 'desktop' | 'tablet' | 'browser';
  status: 'active' | 'synced' | 'standby';
  lastSeen: string;
  location?: string;
}

export interface UserPreferences {
  theme: 'dark' | 'midnight' | 'amoled';
  soundEffects: boolean;
  voiceAutoPlay: boolean;
  streamText: boolean;
  fontSize: 'compact' | 'comfortable' | 'spacious';
}
