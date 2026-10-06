import { Router } from 'express';
import { ChatController } from '../controllers/chat.controller';
import { VoiceController } from '../controllers/voice.controller';
import { PersonalVoiceController } from '../controllers/personal-voice.controller';
import { ConversationController } from '../controllers/conversation.controller';
import { MemoryController } from '../controllers/memory.controller';
import { BrainController } from '../controllers/brain.controller';
import { HealthController } from '../controllers/health.controller';
import { ProviderController } from '../controllers/provider.controller';

const router = Router();

// Chat & Voice
router.post('/chat', ChatController.sendMessage);
router.post('/voice', VoiceController.handleVoice);
router.post('/voice/synthesize', VoiceController.handleVoice);
router.get('/voice/health', VoiceController.getHealth);
router.post('/voice/test', VoiceController.testVoice);

// Personal Voice Engine Endpoints
router.get('/voice/personal/status', PersonalVoiceController.getStatus);
router.post('/voice/personal/reference', PersonalVoiceController.saveReference);
router.delete('/voice/personal/reference', PersonalVoiceController.deleteReference);
router.post('/voice/personal/test', PersonalVoiceController.testPersonalVoice);
router.post('/voice/personal/synthesize', PersonalVoiceController.synthesize);

// Provider Status, Selection & Testing
router.get('/providers/status', ProviderController.getStatus);
router.post('/providers/select', ProviderController.selectProviders);
router.post('/providers/test-text', ProviderController.testText);
router.post('/providers/test-voice', ProviderController.testVoice);

// Conversations
router.get('/conversations', ConversationController.list);
router.post('/conversations', ConversationController.create);
router.get('/conversations/:id', ConversationController.getById);
router.patch('/conversations/:id', ConversationController.update);
router.patch('/conversations/:id/pin', ConversationController.togglePin);
router.get('/conversations/:id/messages', ConversationController.getMessages);
router.delete('/conversations/:id', ConversationController.delete);

// Memories
router.get('/memories', MemoryController.list);
router.post('/memories', MemoryController.create);
router.delete('/memories/:id', MemoryController.delete);

// AI Brain & Profile
router.get('/ai/brain-profile', BrainController.getProfile);
router.post('/ai/brain-profile', BrainController.updateProfile);

// Health Check
router.get('/health', HealthController.getHealth);

export default router;
