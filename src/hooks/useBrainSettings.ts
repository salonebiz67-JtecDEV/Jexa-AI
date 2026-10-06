import { useState, useEffect, useCallback } from 'react';
import { ApiClient } from '../services/api.client';
import { BrainProfile, ProviderStatus, PersonalityStyle } from '../../shared/types';
import { PERSONALITY_PRESETS } from '../../ai/brain/personality';
import { useAuth } from './useAuth';

export function useBrainSettings() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<BrainProfile | null>(null);
  const [providerStatus, setProviderStatus] = useState<ProviderStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchProfile = useCallback(async () => {
    try {
      setIsLoading(true);
      const data = await ApiClient.getBrainProfile();
      setProfile(data.profile);
      setProviderStatus(data.providerStatus);
    } catch (err) {
      console.error('[useBrainSettings] Fetch error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  const updatePersona = useCallback(
    async (personality: PersonalityStyle) => {
      if (!profile) return;
      try {
        const updated = await ApiClient.updateBrainProfile({ activePersonality: personality });
        setProfile(updated);
      } catch (err) {
        console.error('[useBrainSettings] Update persona error:', err);
      }
    },
    [profile]
  );

  const updateSettings = useCallback(
    async (updates: Partial<BrainProfile>) => {
      try {
        const updated = await ApiClient.updateBrainProfile(updates);
        setProfile(updated);
      } catch (err) {
        console.error('[useBrainSettings] Update settings error:', err);
      }
    },
    []
  );

  return {
    profile,
    providerStatus,
    isLoading,
    updatePersona,
    updateSettings,
    refresh: fetchProfile,
    presets: PERSONALITY_PRESETS,
  };
}
