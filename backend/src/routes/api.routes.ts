import { Router } from 'express';
import { ChatController } from '../controllers/chat.controller';
import { VoiceController } from '../controllers/voice.controller';
import { BrainController } from '../controllers/brain.controller';
import { HealthController } from '../controllers/health.controller';
import { ProviderController } from '../controllers/provider.controller';
import { UsageController } from '../controllers/usage.controller';
import { AuthController } from '../controllers/auth.controller';
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
  authRateLimiter,
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
  validateLoginRequest,
} from '../middleware/validation.middleware';

const router = Router();

// Attach verified Bearer auth context (never trusts spoofable identity headers)
router.use(attachAuthContext);

// Authentication & Session Management
router.post('/auth/login', authRateLimiter, validateLoginRequest, AuthController.login);
router.post('/auth/refresh', authRateLimiter, AuthController.refresh);
router.post('/auth/logout', generalApiRateLimiter, AuthController.logout);
router.get('/auth/session', generalApiRateLimiter, AuthController.getSession);

// Owner Security Audit & Setup Status (Owner-only, rate-limited before auth checks)
router.get('/security/audit-logs', expensiveAdminRateLimiter, requireOwner, AuthController.getAuditLogs);
router.get('/security/status', expensiveAdminRateLimiter, requireOwner, AuthController.getSecurityStatus);

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
  expensiveAdminRateLimiter,
  requireOwner,
  validateProviderTestRequest,
  VoiceController.testVoice
);

// Provider Status, Selection & Testing
router.get('/providers/status', generalApiRateLimiter, ProviderController.getStatus);
router.post(
  '/providers/select',
  expensiveAdminRateLimiter,
  requireOwner,
  validateProviderSelectRequest,
  ProviderController.selectProviders
);
router.post(
  '/providers/test-text',
  expensiveAdminRateLimiter,
  requireOwner,
  validateProviderTestRequest,
  ProviderController.testText
);
router.post(
  '/providers/test-voice',
  expensiveAdminRateLimiter,
  requireOwner,
  validateProviderTestRequest,
  ProviderController.testVoice
);

// Usage Tracking & Tool Administration (Owner-only)
router.get('/usage/summary', expensiveAdminRateLimiter, requireOwner, UsageController.getSummary);
router.get('/tools/status', expensiveAdminRateLimiter, requireOwner, UsageController.getToolsStatus);
router.post(
  '/tools/toggle',
  expensiveAdminRateLimiter,
  requireOwner,
  validateToolToggleRequest,
  UsageController.toggleTool
);
router.post(
  '/tools/test',
  expensiveAdminRateLimiter,
  requireOwner,
  validateToolTestRequest,
  UsageController.testTool
);

// AI Brain & Profile
router.get('/ai/brain-profile', generalApiRateLimiter, BrainController.getProfile);
router.post(
  '/ai/brain-profile',
  expensiveAdminRateLimiter,
  requireOwner,
  validateBrainProfileUpdateRequest,
  BrainController.updateProfile
);

// Health Check
router.get('/health', generalApiRateLimiter, HealthController.getHealth);

export default router;
