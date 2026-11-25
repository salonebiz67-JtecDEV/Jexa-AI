import { Router } from 'express';
import { ChatController } from '../controllers/chat.controller';
import { VoiceController } from '../controllers/voice.controller';
import { BrainController } from '../controllers/brain.controller';
import { HealthController } from '../controllers/health.controller';
import { ProviderController } from '../controllers/provider.controller';
import { UsageController } from '../controllers/usage.controller';
import {
  attachAuthContext,
  requireAuthIfConfigured,
  requireOwner,
} from '../middleware/auth.middleware';
import {
  chatRateLimiter,
  voiceRateLimiter,
  expensiveAdminRateLimiter,
  generalApiRateLimiter,
} from '../middleware/rate-limit.middleware';
import {
  validateChatRequest,
  validateChatTitleRequest,
  validateVoiceRequest,
  validateProviderSelectRequest,
  validateProviderTestRequest,
  validateToolToggleRequest,
  validateToolTestRequest,
  validateBrainProfileUpdateRequest,
} from '../middleware/validation.middleware';

const router = Router();

// Attach verified Bearer auth context (never trusts spoofable identity headers)
router.use(attachAuthContext);

// Chat & Voice
router.post(
  '/chat',
  requireAuthIfConfigured,
  chatRateLimiter,
  validateChatRequest,
  ChatController.sendMessage
);
router.post(
  '/chat/title',
  requireAuthIfConfigured,
  generalApiRateLimiter,
  validateChatTitleRequest,
  ChatController.generateTitle
);
router.post(
  '/voice',
  requireAuthIfConfigured,
  voiceRateLimiter,
  validateVoiceRequest,
  VoiceController.handleVoice
);
router.post(
  '/voice/synthesize',
  requireAuthIfConfigured,
  voiceRateLimiter,
  validateVoiceRequest,
  VoiceController.handleVoice
);
router.get('/voice/health', generalApiRateLimiter, VoiceController.getHealth);
router.post(
  '/voice/test',
  requireOwner,
  expensiveAdminRateLimiter,
  validateProviderTestRequest,
  VoiceController.testVoice
);

// Provider Status, Selection & Testing
router.get('/providers/status', generalApiRateLimiter, ProviderController.getStatus);
router.post(
  '/providers/select',
  requireOwner,
  expensiveAdminRateLimiter,
  validateProviderSelectRequest,
  ProviderController.selectProviders
);
router.post(
  '/providers/test-text',
  requireOwner,
  expensiveAdminRateLimiter,
  validateProviderTestRequest,
  ProviderController.testText
);
router.post(
  '/providers/test-voice',
  requireOwner,
  expensiveAdminRateLimiter,
  validateProviderTestRequest,
  ProviderController.testVoice
);

// Usage Tracking & Tool Administration (Owner-only)
router.get('/usage/summary', requireOwner, expensiveAdminRateLimiter, UsageController.getSummary);
router.get('/tools/status', requireOwner, expensiveAdminRateLimiter, UsageController.getToolsStatus);
router.post(
  '/tools/toggle',
  requireOwner,
  expensiveAdminRateLimiter,
  validateToolToggleRequest,
  UsageController.toggleTool
);
router.post(
  '/tools/test',
  requireOwner,
  expensiveAdminRateLimiter,
  validateToolTestRequest,
  UsageController.testTool
);

// AI Brain & Profile
router.get('/ai/brain-profile', generalApiRateLimiter, BrainController.getProfile);
router.post(
  '/ai/brain-profile',
  requireOwner,
  expensiveAdminRateLimiter,
  validateBrainProfileUpdateRequest,
  BrainController.updateProfile
);

// Health Check
router.get('/health', generalApiRateLimiter, HealthController.getHealth);

export default router;
