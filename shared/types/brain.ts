import { TextProviderType, VoiceProviderType } from './provider';

export type PersonalityStyle = 'empathetic_companion' | 'deep_thinker' | 'creative_muse' | 'executive_partner';

export interface BrainProfile {
  id: string;
  name: string;
  tagline: string;
  creator: string;
  version: string;
  activePersonality: PersonalityStyle;
  selectedTextProvider?: TextProviderType;
  selectedTextModel?: string;
  selectedVoiceProvider?: VoiceProviderType;
  selectedVoiceModel?: string;
  theme?: 'dark' | 'midnight' | 'obsidian' | 'light' | 'system';
  traits: string[];
  toneParameters: {
    warmth: number;       // 0 to 1
    humor: number;        // 0 to 1
    conciseness: number;  // 0 to 1
    curiosity: number;    // 0 to 1
  };
  voiceSettings: {
    voiceId: string;
    speed: number;
    pitch: number;
    autoSpeak: boolean;
  };
  memorySettings: {
    enabled: boolean;
    autoExtract: boolean;
    maxContextMemories: number;
  };
  personalVoiceSettings?: {
    referenceId?: string;
    sampleName?: string;
    durationSeconds?: number;
    recordedAt?: string;
    engine?: string;
    model?: string;
  };
}

export interface PersonalityDefinition {
  id: PersonalityStyle;
  label: string;
  description: string;
  tone: string;
  systemPromptModifier: string;
  greetingExample: string;
}
