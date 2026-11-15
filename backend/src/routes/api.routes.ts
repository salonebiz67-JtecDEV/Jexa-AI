import { Router } from 'express';
import { ChatController } from '../controllers/chat.controller';
import { VoiceController } from '../controllers/voice.controller';
import { BrainController } from '../controllers/brain.controller';
import { HealthController } from '../controllers/health.controller';
import { ProviderController } from '../controllers/provider.controller';
import { UsageController } from '../controllers/usage.controller';

const router = Router();

// Chat & Voice
router.post('/chat', ChatController.sendMessage);
router.post('/chat/title', ChatController.generateTitle);
router.post('/voice', VoiceController.handleVoice);
router.post('/voice/synthesize', VoiceController.handleVoice);
router.get('/voice/health', VoiceController.getHealth);
router.post('/voice/test', VoiceController.testVoice);

// Provider Status, Selection & Testing
router.get('/providers/status', ProviderController.getStatus);
router.post('/providers/select', ProviderController.selectProviders);
router.post('/providers/test-text', ProviderController.testText);
router.post('/providers/test-voice', ProviderController.testVoice);

// Usage Tracking & Tool Administration
router.get('/usage/summary', UsageController.getSummary);
router.get('/tools/status', UsageController.getToolsStatus);
router.post('/tools/toggle', UsageController.toggleTool);
router.post('/tools/test', UsageController.testTool);

// AI Brain & Profile
router.get('/ai/brain-profile', BrainController.getProfile);
router.post('/ai/brain-profile', BrainController.updateProfile);

// Health Check
router.get('/health', HealthController.getHealth);

export default router;
