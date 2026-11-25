import { Request, Response, NextFunction } from 'express';
import { isTtsModel } from '../../../shared/types/provider';

const SAFE_MODEL_REGEX = /^[a-zA-Z0-9._:/-]{1,120}$/;
const SAFE_TOOL_NAME_REGEX = /^[a-zA-Z0-9_-]{1,64}$/;
const ALLOWED_THEMES = new Set(['dark', 'midnight', 'obsidian', 'light', 'system']);
const ALLOWED_PERSONALITIES = new Set([
  'empathetic_companion',
  'deep_thinker',
  'creative_muse',
  'executive_partner',
]);
const ALLOWED_PROVIDERS = new Set(['gemini', 'litellm', 'groq']);

function isPlainObject(val: unknown): val is Record<string, any> {
  return Boolean(val && typeof val === 'object' && !Array.isArray(val));
}

function hasUnsafeKeys(obj: Record<string, any>): boolean {
  return (
    Object.prototype.hasOwnProperty.call(obj, '__proto__') ||
    Object.prototype.hasOwnProperty.call(obj, 'constructor') ||
    Object.prototype.hasOwnProperty.call(obj, 'prototype')
  );
}

function sendValidationError(res: Response, message: string, code = 'VALIDATION_ERROR'): void {
  res.status(400).json({
    success: false,
    code,
    error: message,
    timestamp: new Date().toISOString(),
  });
}

export function validateChatRequest(req: Request, res: Response, next: NextFunction): void {
  if (!isPlainObject(req.body) || hasUnsafeKeys(req.body)) {
    sendValidationError(res, 'Request body must be a valid JSON object.');
    return;
  }

  const {
    message,
    conversationId,
    history,
    aboutMe,
    behaviorInstructions,
    stream,
    personaId,
    textProvider,
    textModel,
    backupModel,
    isVoiceMode,
    userContext,
  } = req.body;

  if (typeof message !== 'string' || !message.trim()) {
    sendValidationError(res, 'A non-empty message string is required.');
    return;
  }
  if (message.length > 32000) {
    sendValidationError(res, 'Message exceeds maximum allowed length of 32,000 characters.');
    return;
  }

  if (conversationId !== undefined) {
    if (typeof conversationId !== 'string' || conversationId.length > 128) {
      sendValidationError(res, 'conversationId must be a valid string under 128 characters.');
      return;
    }
  }

  if (history !== undefined) {
    if (!Array.isArray(history) || history.length > 25) {
      sendValidationError(res, 'history must be an array of at most 25 messages.');
      return;
    }
    for (const item of history) {
      if (
        !isPlainObject(item) ||
        (item.role !== 'user' && item.role !== 'assistant') ||
        typeof item.content !== 'string' ||
        item.content.length > 32000
      ) {
        sendValidationError(res, 'Each history entry must include a valid role ("user" or "assistant") and bounded string content.');
        return;
      }
    }
  }

  if (aboutMe !== undefined && (typeof aboutMe !== 'string' || aboutMe.length > 2000)) {
    sendValidationError(res, 'aboutMe must be a string of at most 2,000 characters.');
    return;
  }

  if (
    behaviorInstructions !== undefined &&
    (typeof behaviorInstructions !== 'string' || behaviorInstructions.length > 2000)
  ) {
    sendValidationError(res, 'behaviorInstructions must be a string of at most 2,000 characters.');
    return;
  }

  if (stream !== undefined && typeof stream !== 'boolean') {
    sendValidationError(res, 'stream must be a boolean.');
    return;
  }

  if (isVoiceMode !== undefined && typeof isVoiceMode !== 'boolean') {
    sendValidationError(res, 'isVoiceMode must be a boolean.');
    return;
  }

  if (personaId !== undefined && (typeof personaId !== 'string' || personaId.length > 64)) {
    sendValidationError(res, 'personaId must be a valid string.');
    return;
  }

  if (textProvider !== undefined && (typeof textProvider !== 'string' || !ALLOWED_PROVIDERS.has(textProvider))) {
    sendValidationError(res, 'Unsupported textProvider value.');
    return;
  }

  for (const [label, modelVal] of [
    ['textModel', textModel],
    ['backupModel', backupModel],
  ] as const) {
    if (modelVal !== undefined && modelVal !== '') {
      if (typeof modelVal !== 'string' || !SAFE_MODEL_REGEX.test(modelVal.trim())) {
        sendValidationError(res, `${label} contains invalid characters or exceeds 120 characters.`);
        return;
      }
      if (isTtsModel(modelVal.trim())) {
        sendValidationError(res, `Voice/TTS model '${modelVal}' cannot be used for chat.`, 'INVALID_MODEL_TYPE');
        return;
      }
    }
  }

  if (userContext !== undefined) {
    if (!isPlainObject(userContext) || hasUnsafeKeys(userContext)) {
      sendValidationError(res, 'userContext must be a valid object.');
      return;
    }
    for (const key of ['userName', 'timezone', 'location'] as const) {
      if (
        userContext[key] !== undefined &&
        (typeof userContext[key] !== 'string' || userContext[key].length > 200)
      ) {
        sendValidationError(res, `userContext.${key} must be a string under 200 characters.`);
        return;
      }
    }
  }

  next();
}

export function validateChatTitleRequest(req: Request, res: Response, next: NextFunction): void {
  if (!isPlainObject(req.body) || hasUnsafeKeys(req.body)) {
    sendValidationError(res, 'Request body must be a valid JSON object.');
    return;
  }
  const { userMessage, assistantMessage } = req.body;
  if (typeof userMessage !== 'string' || !userMessage.trim() || userMessage.length > 8000) {
    sendValidationError(res, 'userMessage must be a non-empty string under 8,000 characters.');
    return;
  }
  if (assistantMessage !== undefined && (typeof assistantMessage !== 'string' || assistantMessage.length > 8000)) {
    sendValidationError(res, 'assistantMessage must be a string under 8,000 characters.');
    return;
  }
  next();
}

export function validateVoiceRequest(req: Request, res: Response, next: NextFunction): void {
  if (!isPlainObject(req.body) || hasUnsafeKeys(req.body)) {
    sendValidationError(res, 'Request body must be a valid JSON object.');
    return;
  }
  const { text, voiceId, model, speed, pitch } = req.body;

  if (typeof text !== 'string' || !text.trim() || text.length > 8000) {
    sendValidationError(res, 'text must be a non-empty string under 8,000 characters.');
    return;
  }
  if (voiceId !== undefined && (typeof voiceId !== 'string' || !SAFE_MODEL_REGEX.test(voiceId.trim()))) {
    sendValidationError(res, 'Invalid voiceId format.');
    return;
  }
  if (model !== undefined && model !== '') {
    if (typeof model !== 'string' || !SAFE_MODEL_REGEX.test(model.trim())) {
      sendValidationError(res, 'Invalid voice model identifier.');
      return;
    }
    if (!isTtsModel(model.trim())) {
      sendValidationError(res, `Chat model '${model}' cannot be used for voice. Select a TTS voice model.`, 'INVALID_MODEL_TYPE');
      return;
    }
  }
  if (speed !== undefined && (typeof speed !== 'number' || !Number.isFinite(speed) || speed < 0.25 || speed > 4.0)) {
    sendValidationError(res, 'speed must be a finite number between 0.25 and 4.0.');
    return;
  }
  if (pitch !== undefined && (typeof pitch !== 'number' || !Number.isFinite(pitch) || pitch < 0.25 || pitch > 4.0)) {
    sendValidationError(res, 'pitch must be a finite number between 0.25 and 4.0.');
    return;
  }

  next();
}

export function validateProviderSelectRequest(req: Request, res: Response, next: NextFunction): void {
  if (!isPlainObject(req.body) || hasUnsafeKeys(req.body)) {
    sendValidationError(res, 'Request body must be a valid JSON object.');
    return;
  }

  const allowedKeys = new Set([
    'textProvider',
    'voiceProvider',
    'textModel',
    'backupModel',
    'voiceModel',
    'theme',
  ]);
  for (const key of Object.keys(req.body)) {
    if (!allowedKeys.has(key)) {
      sendValidationError(res, `Unsupported configuration field: "${key}".`);
      return;
    }
  }

  const { textModel, backupModel, voiceModel, theme } = req.body;
  for (const [label, val] of [
    ['textModel', textModel],
    ['backupModel', backupModel],
  ] as const) {
    if (val !== undefined && val !== '') {
      if (typeof val !== 'string' || !SAFE_MODEL_REGEX.test(val.trim())) {
        sendValidationError(res, `${label} contains invalid characters.`);
        return;
      }
      if (isTtsModel(val.trim())) {
        sendValidationError(res, `Voice/TTS model '${val}' cannot be used as a chat model.`, 'INVALID_MODEL_TYPE');
        return;
      }
    }
  }

  if (voiceModel !== undefined && voiceModel !== '') {
    if (typeof voiceModel !== 'string' || !SAFE_MODEL_REGEX.test(voiceModel.trim())) {
      sendValidationError(res, 'voiceModel contains invalid characters.');
      return;
    }
    if (!isTtsModel(voiceModel.trim())) {
      sendValidationError(res, `Chat model '${voiceModel}' cannot be used for voice. Select a TTS voice model.`, 'INVALID_MODEL_TYPE');
      return;
    }
  }

  if (theme !== undefined && (typeof theme !== 'string' || !ALLOWED_THEMES.has(theme))) {
    sendValidationError(res, 'Invalid theme value.');
    return;
  }

  next();
}

export function validateProviderTestRequest(req: Request, res: Response, next: NextFunction): void {
  if (req.body !== undefined && (!isPlainObject(req.body) || hasUnsafeKeys(req.body))) {
    sendValidationError(res, 'Request body must be a valid JSON object.');
    return;
  }
  const { model, text } = req.body || {};
  if (model !== undefined && model !== '' && (typeof model !== 'string' || !SAFE_MODEL_REGEX.test(model.trim()))) {
    sendValidationError(res, 'Invalid model identifier.');
    return;
  }
  if (text !== undefined && (typeof text !== 'string' || text.length > 2000)) {
    sendValidationError(res, 'text must be a string under 2,000 characters.');
    return;
  }
  next();
}

export function validateToolToggleRequest(req: Request, res: Response, next: NextFunction): void {
  if (!isPlainObject(req.body) || hasUnsafeKeys(req.body)) {
    sendValidationError(res, 'Request body must be a valid JSON object.');
    return;
  }
  const { toolName, enabled } = req.body;
  if (typeof toolName !== 'string' || !SAFE_TOOL_NAME_REGEX.test(toolName.trim())) {
    sendValidationError(res, 'toolName must be a valid tool identifier.');
    return;
  }
  if (enabled !== undefined && typeof enabled !== 'boolean') {
    sendValidationError(res, 'enabled must be a boolean.');
    return;
  }
  next();
}

export function validateToolTestRequest(req: Request, res: Response, next: NextFunction): void {
  if (!isPlainObject(req.body) || hasUnsafeKeys(req.body)) {
    sendValidationError(res, 'Request body must be a valid JSON object.');
    return;
  }
  const { toolName } = req.body;
  if (typeof toolName !== 'string' || !SAFE_TOOL_NAME_REGEX.test(toolName.trim())) {
    sendValidationError(res, 'toolName must be a valid tool identifier.');
    return;
  }
  next();
}

export function validateBrainProfileUpdateRequest(req: Request, res: Response, next: NextFunction): void {
  if (!isPlainObject(req.body) || hasUnsafeKeys(req.body)) {
    sendValidationError(res, 'Request body must be a valid JSON object.');
    return;
  }

  const allowedTopKeys = new Set([
    'activePersonality',
    'selectedTextProvider',
    'selectedTextModel',
    'selectedBackupModel',
    'selectedVoiceProvider',
    'selectedVoiceModel',
    'theme',
    'toneParameters',
    'voiceSettings',
  ]);

  const sanitized: Record<string, any> = {};
  for (const [k, v] of Object.entries(req.body)) {
    if (!allowedTopKeys.has(k)) {
      sendValidationError(res, `Unsupported profile field: "${k}".`);
      return;
    }
    sanitized[k] = v;
  }

  if (
    sanitized.activePersonality !== undefined &&
    (typeof sanitized.activePersonality !== 'string' || !ALLOWED_PERSONALITIES.has(sanitized.activePersonality))
  ) {
    sendValidationError(res, 'Invalid activePersonality value.');
    return;
  }

  if (sanitized.theme !== undefined && (typeof sanitized.theme !== 'string' || !ALLOWED_THEMES.has(sanitized.theme))) {
    sendValidationError(res, 'Invalid theme value.');
    return;
  }

  for (const field of ['selectedTextModel', 'selectedBackupModel', 'selectedVoiceModel'] as const) {
    if (sanitized[field] !== undefined && sanitized[field] !== '') {
      if (typeof sanitized[field] !== 'string' || !SAFE_MODEL_REGEX.test(sanitized[field].trim())) {
        sendValidationError(res, `Invalid ${field} identifier.`);
        return;
      }
    }
  }

  if (sanitized.toneParameters !== undefined) {
    if (!isPlainObject(sanitized.toneParameters) || hasUnsafeKeys(sanitized.toneParameters)) {
      sendValidationError(res, 'toneParameters must be an object.');
      return;
    }
    for (const k of ['warmth', 'humor', 'conciseness', 'curiosity'] as const) {
      const val = sanitized.toneParameters[k];
      if (val !== undefined && (typeof val !== 'number' || !Number.isFinite(val) || val < 0 || val > 1)) {
        sendValidationError(res, `toneParameters.${k} must be a number between 0 and 1.`);
        return;
      }
    }
  }

  if (sanitized.voiceSettings !== undefined) {
    if (!isPlainObject(sanitized.voiceSettings) || hasUnsafeKeys(sanitized.voiceSettings)) {
      sendValidationError(res, 'voiceSettings must be an object.');
      return;
    }
    const vs = sanitized.voiceSettings;
    if (vs.voiceId !== undefined && (typeof vs.voiceId !== 'string' || !SAFE_MODEL_REGEX.test(vs.voiceId))) {
      sendValidationError(res, 'Invalid voiceSettings.voiceId.');
      return;
    }
    if (vs.autoSpeak !== undefined && typeof vs.autoSpeak !== 'boolean') {
      sendValidationError(res, 'voiceSettings.autoSpeak must be a boolean.');
      return;
    }
  }

  req.body = sanitized;
  next();
}
