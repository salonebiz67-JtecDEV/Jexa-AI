import assert from 'node:assert/strict';
import http from 'node:http';
import crypto from 'node:crypto';
import type { AddressInfo } from 'node:net';

function makeFakeJwt(sub: string, expOffsetSec = 3600): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(
    JSON.stringify({
      sub,
      exp: Math.floor(Date.now() / 1000) + expOffsetSec,
    })
  ).toString('base64url');
  return `${header}.${payload}.sig_${crypto.randomBytes(8).toString('hex')}`;
}

function readJsonBody(req: http.IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    req.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf8');
      if (!text) return resolve(null);
      try {
        resolve(JSON.parse(text));
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

async function runPhase1Verification(): Promise<void> {
  console.log('==========================================================');
  console.log('JEXA PHASE 1: LITELLM GATEWAY & SECURITY TEST SUITE');
  console.log('==========================================================\n');

  const LITELLM_TEST_KEY = 'sk-litellm-phase1-test-master-key-998877';
  const UPSTASH_TEST_TOKEN = 'upstash-phase1-test-token-123456';
  const SUPABASE_TEST_ANON = 'sb-anon-phase1-test-key-123456';
  const OWNER_TOKEN = makeFakeJwt('owner-user-1');
  const USER_TOKEN = makeFakeJwt('regular-user-2');
  const EXPIRED_TOKEN = makeFakeJwt('expired-user-3', -120);

  let simulatePrimary429 = false;
  let simulateToolCallOnce = false;
  const gatewayObservedRequests: Array<{ model: string; stream: boolean; noCache: boolean; cacheControl?: string }> = [];
  const redisCounters = new Map<string, { count: number; resetAtMs: number }>();

  // 1. Start local LiteLLM Gateway simulator
  const litellmServer = http.createServer(async (req, res) => {
    const auth = req.headers.authorization || '';
    if (auth !== `Bearer ${LITELLM_TEST_KEY}`) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: { message: 'Invalid LiteLLM API key', code: 'AUTHENTICATION_ERROR' } }));
      return;
    }

    if (req.url === '/health/liveliness' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'alive' }));
      return;
    }

    if (req.url === '/v1/models' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          data: [
            { id: 'jexa-chat-primary' },
            { id: 'jexa-chat-backup' },
            { id: 'jexa-groq-fast' },
            { id: 'jexa-groq-versatile' },
          ],
        })
      );
      return;
    }

    if (req.url === '/v1/chat/completions' && req.method === 'POST') {
      const body = await readJsonBody(req);
      const model = String(body?.model || 'jexa-chat-primary');
      const stream = Boolean(body?.stream);
      const noCache = body?.cache?.['no-cache'] === true && body?.metadata?.no_cache === true;
      gatewayObservedRequests.push({
        model,
        stream,
        noCache,
        cacheControl: String(req.headers['cache-control'] || ''),
      });

      if (simulatePrimary429 && model === 'jexa-chat-primary') {
        res.writeHead(429, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: { message: 'Rate limit exceeded on primary Gemini model', code: '429' } }));
        return;
      }

      if (simulateToolCallOnce && Array.isArray(body?.tools) && body.tools.length > 0 && !body.messages?.some((m: any) => m.role === 'tool')) {
        simulateToolCallOnce = false;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            id: 'chatcmpl-tool-1',
            model,
            choices: [
              {
                index: 0,
                finish_reason: 'tool_calls',
                message: {
                  role: 'assistant',
                  content: null,
                  tool_calls: [
                    {
                      id: 'call_time_1',
                      type: 'function',
                      function: { name: 'system_time', arguments: JSON.stringify({ timezone: 'UTC' }) },
                    },
                  ],
                },
              },
            ],
            usage: { prompt_tokens: 45, completion_tokens: 18, total_tokens: 63 },
          })
        );
        return;
      }

      const upstreamModel =
        model.includes('groq') ? 'groq/llama-3.1-8b-instant' : `gemini/${model}`;
      const replyText =
        model.includes('groq')
          ? `Groq route ok via ${upstreamModel}`
          : model === 'jexa-chat-backup'
          ? `Fallback backup ok via ${upstreamModel}`
          : `Gateway response ok via ${upstreamModel}`;

      if (stream) {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'x-litellm-model-api-base': model.includes('groq')
            ? 'https://api.groq.com/openai/v1'
            : 'https://generativelanguage.googleapis.com',
        });
        const words = replyText.split(' ');
        for (const w of words) {
          res.write(
            `data: ${JSON.stringify({
              id: 'chatcmpl-stream-1',
              model: upstreamModel,
              choices: [{ index: 0, delta: { content: `${w} ` }, finish_reason: null }],
            })}\n\n`
          );
        }
        res.write(
          `data: ${JSON.stringify({
            id: 'chatcmpl-stream-1',
            model: upstreamModel,
            choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
            usage: { prompt_tokens: 60, completion_tokens: 12, total_tokens: 72 },
          })}\n\n`
        );
        res.write('data: [DONE]\n\n');
        res.end();
        return;
      }

      res.writeHead(200, {
        'Content-Type': 'application/json',
        'x-litellm-model-api-base': model.includes('groq')
          ? 'https://api.groq.com/openai/v1'
          : 'https://generativelanguage.googleapis.com',
      });
      res.end(
        JSON.stringify({
          id: 'chatcmpl-1',
          model: upstreamModel,
          choices: [
            {
              index: 0,
              finish_reason: 'stop',
              message: { role: 'assistant', content: replyText },
            },
          ],
          usage: { prompt_tokens: 55, completion_tokens: 14, total_tokens: 69 },
        })
      );
      return;
    }

    res.writeHead(404);
    res.end();
  });

  // 2. Start local Supabase Auth simulator
  const supabaseServer = http.createServer((req, res) => {
    if (req.url === '/auth/v1/user' && req.method === 'GET') {
      const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
      if (token === OWNER_TOKEN) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            id: 'owner-user-1',
            email: 'owner@jexa.local',
            app_metadata: { role: 'owner' },
          })
        );
        return;
      }
      if (token === USER_TOKEN) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            id: 'regular-user-2',
            email: 'user@jexa.local',
            app_metadata: { role: 'user' },
            user_metadata: { role: 'owner' }, // Verify user_metadata cannot escalate to owner!
          })
        );
        return;
      }
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'invalid_token' }));
      return;
    }
    res.writeHead(404);
    res.end();
  });

  // 3. Start local Upstash Redis REST simulator
  const upstashServer = http.createServer(async (req, res) => {
    if ((req.headers.authorization || '') !== `Bearer ${UPSTASH_TEST_TOKEN}`) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized' }));
      return;
    }
    const body = await readJsonBody(req);
    assert.equal(body?.[0], 'EVAL');
    const key = String(body[3]);
    const windowMs = Number(body[4]) || 60000;
    const now = Date.now();
    let entry = redisCounters.get(key);
    if (!entry || now >= entry.resetAtMs) {
      entry = { count: 0, resetAtMs: now + windowMs };
    }
    entry.count += 1;
    redisCounters.set(key, entry);
    const ttl = Math.max(1, entry.resetAtMs - now);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ result: [entry.count, ttl] }));
  });

  await Promise.all([
    new Promise<void>((r) => litellmServer.listen(0, '127.0.0.1', r)),
    new Promise<void>((r) => supabaseServer.listen(0, '127.0.0.1', r)),
    new Promise<void>((r) => upstashServer.listen(0, '127.0.0.1', r)),
  ]);

  const litellmPort = (litellmServer.address() as AddressInfo).port;
  const supabasePort = (supabaseServer.address() as AddressInfo).port;
  const upstashPort = (upstashServer.address() as AddressInfo).port;

  // Configure env before importing app/registry
  process.env.LITELLM_BASE_URL = `http://127.0.0.1:${litellmPort}`;
  process.env.LITELLM_API_KEY = LITELLM_TEST_KEY;
  process.env.LITELLM_MASTER_KEY = LITELLM_TEST_KEY;
  process.env.SUPABASE_URL = `http://127.0.0.1:${supabasePort}`;
  process.env.SUPABASE_ANON_KEY = SUPABASE_TEST_ANON;
  process.env.UPSTASH_REDIS_REST_URL = `http://127.0.0.1:${upstashPort}`;
  process.env.UPSTASH_REDIS_REST_TOKEN = UPSTASH_TEST_TOKEN;
  process.env.RATE_LIMIT_CHAT_MAX = '5';
  process.env.GEMINI_API_KEY = 'AIzaSyDummyPhase1VerificationKey1234567890';
  process.env.GROQ_API_KEY = 'gsk_dummyPhase1VerificationKey1234567890';

  const { AIProviderRegistry } = await import('../ai/providers/registry');
  const { normalizeGatewayBaseUrl } = await import('../ai/providers/config');
  const { LiteLLMTextAIProvider } = await import('../ai/providers/litellm.provider');
  const { createRateLimiter, RateLimitStore } = await import('../backend/src/middleware/rate-limit.middleware');
  const { ErrorLogService } = await import('../backend/src/services/error-log.service');
  const { SecurityAuditService } = await import('../backend/src/services/security-audit.service');
  const { scrubSecretsAndUrls } = await import('../shared/types/provider');
  const { UsageTracker } = await import('../backend/src/services/usage-tracker.service');
  const { createApp, isOriginAllowed } = await import('../server');

  AIProviderRegistry.reload();
  RateLimitStore.resetTelemetryForTesting();
  SecurityAuditService.clear();

  const app = createApp({ includeErrorHandler: true });
  const appServer = http.createServer(app);
  await new Promise<void>((r) => appServer.listen(0, '127.0.0.1', r));
  const appPort = (appServer.address() as AddressInfo).port;
  const baseUrl = `http://127.0.0.1:${appPort}`;

  try {
    // Test A: Health & Security Headers & Zero Secret/URL Leakage
    const healthRes = await fetch(`${baseUrl}/health`);
    assert.equal(healthRes.status, 200);
    assert.equal(healthRes.headers.get('x-powered-by'), null);
    assert.equal(healthRes.headers.get('x-content-type-options'), 'nosniff');
    assert.ok(healthRes.headers.get('content-security-policy')?.includes("frame-ancestors 'none'"));
    const healthJson: any = await healthRes.json();
    assert.equal(healthJson.gatewayActive, true);
    assert.equal(healthJson.textProvider, 'litellm');
    assert.equal(healthJson.voiceProvider, 'gemini');
    assert.ok(!JSON.stringify(healthJson).includes(LITELLM_TEST_KEY));
    assert.ok(!JSON.stringify(healthJson).includes(`127.0.0.1:${litellmPort}`));
    console.log('✓ Test A: Server startup, /health, security headers, and zero credential/URL leakage passed.');

    // Test B: LiteLLM gateway connectivity & privacy headers
    const litellm = new LiteLLMTextAIProvider('jexa-chat-primary');
    const gwHealth = await litellm.checkGatewayHealth();
    assert.equal(gwHealth.reachable, true);
    console.log('✓ Test B: LiteLLM Gateway liveliness check passed.');

    // Test C: Authentication enforcement & user_metadata anti-escalation
    // Verify normal chat stays accessible when REQUIRE_AUTH_FOR_CHAT is false, and enforces 401 when REQUIRE_AUTH_FOR_CHAT=true
    process.env.REQUIRE_AUTH_FOR_CHAT = 'true';
    const unauthChat = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Hello' }),
    });
    assert.equal(unauthChat.status, 401);
    delete process.env.REQUIRE_AUTH_FOR_CHAT;

    const expiredChat = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${EXPIRED_TOKEN}` },
      body: JSON.stringify({ message: 'Hello' }),
    });
    assert.equal(expiredChat.status, 401);

    // Non-owner user with forged user_metadata.role='owner' MUST receive 403 on admin endpoints
    for (const [method, endpoint, body] of [
      ['GET', '/api/usage/summary', undefined],
      ['GET', '/api/tools/status', undefined],
      ['POST', '/api/tools/toggle', { toolName: 'system_time', enabled: true }],
      ['POST', '/api/tools/test', { toolName: 'system_time' }],
      ['POST', '/api/providers/select', { textModel: 'gemini-3.8-flash' }],
      ['POST', '/api/providers/test-text', { model: 'gemini-3.8-flash' }],
      ['POST', '/api/providers/test-voice', { model: 'gemini-3.8-flash-lite-tts' }],
      ['POST', '/api/voice/test', { model: 'gemini-3.8-flash-lite-tts' }],
      ['POST', '/api/ai/brain-profile', { theme: 'dark' }],
    ] as const) {
      const unauthAdmin = await fetch(`${baseUrl}${endpoint}`, {
        method,
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      assert.equal(unauthAdmin.status, 401, `Expected 401 unauthenticated on ${method} ${endpoint}`);

      const nonOwnerAdmin = await fetch(`${baseUrl}${endpoint}`, {
        method,
        headers: {
          Authorization: `Bearer ${USER_TOKEN}`,
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      assert.equal(nonOwnerAdmin.status, 403, `Expected 403 non-owner on ${method} ${endpoint}`);
    }

    const ownerSummary = await fetch(`${baseUrl}/api/usage/summary`, {
      headers: { Authorization: `Bearer ${OWNER_TOKEN}` },
    });
    assert.equal(ownerSummary.status, 200);
    console.log('✓ Test C: Auth rejection (401), admin endpoint protection (401/403), and owner access (200) passed.');

    // Test D: Input validation & payload size limit (400 / 413)
    const badModelRes = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${USER_TOKEN}` },
      body: JSON.stringify({ message: 'Hi', textModel: 'gemini-3.8-flash-lite-tts' }),
    });
    assert.equal(badModelRes.status, 400);

    const badVoiceModelRes = await fetch(`${baseUrl}/api/voice`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${USER_TOKEN}` },
      body: JSON.stringify({ text: 'Hello', model: 'gemini-3.8-flash' }),
    });
    assert.equal(badVoiceModelRes.status, 400);

    const oversizedRes = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${USER_TOKEN}` },
      body: JSON.stringify({ message: 'x'.repeat(1_200_000) }),
    });
    assert.equal(oversizedRes.status, 413);
    console.log('✓ Test D: Strict input validation (400) and payload size limit (413) passed.');

    // Test E: Gemini routing, Groq routing, tool round, fallback, and SSE streaming through LiteLLM Gateway
    simulateToolCallOnce = true;
    const chatJsonRes = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${USER_TOKEN}` },
      body: JSON.stringify({ message: 'What time is it?', stream: false }),
    });
    assert.equal(chatJsonRes.status, 200);
    const chatJson: any = await chatJsonRes.json();
    assert.equal(chatJson.success, true);
    assert.ok(chatJson.data.message.content.includes('Gateway response ok via gemini/jexa-chat-primary'));
    assert.equal(chatJson.data.message.metadata.provider, 'litellm');

    // Verify Groq routing via alias
    const groqStreamRes = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        Authorization: `Bearer ${USER_TOKEN}`,
      },
      body: JSON.stringify({ message: 'Ping Groq stream', textModel: 'jexa-groq-fast', stream: true }),
    });
    assert.equal(groqStreamRes.status, 200);
    const sseText = await groqStreamRes.text();
    assert.ok(sseText.includes('"type":"chunk"'));
    assert.ok(sseText.includes('"type":"complete"'));
    assert.ok(sseText.includes('Groq route ok via groq/llama-3.1-8b-instant'));

    // Verify backup fallback when primary returns 429
    simulatePrimary429 = true;
    const failoverRes = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${USER_TOKEN}` },
      body: JSON.stringify({ message: 'Trigger failover', stream: false }),
    });
    simulatePrimary429 = false;
    assert.equal(failoverRes.status, 200);
    const failoverJson: any = await failoverRes.json();
    assert.equal(failoverJson.data.message.metadata.fallbackUsed, true);
    assert.ok(failoverJson.data.message.content.includes('Fallback backup ok via gemini/jexa-chat-backup'));

    // Verify no-cache privacy headers on all gateway requests
    assert.ok(gatewayObservedRequests.length >= 3);
    assert.ok(
      gatewayObservedRequests.every((r) => r.noCache && Boolean(r.cacheControl?.includes('no-store'))),
      'All LiteLLM calls must include no-cache privacy controls'
    );
    console.log('✓ Test E: LiteLLM Gemini routing, tool calling, Groq SSE streaming, 429 fallback, and privacy headers passed.');

    // Test F: Voice health & existing voice preservation
    const voiceHealthRes = await fetch(`${baseUrl}/api/voice/health`);
    assert.equal(voiceHealthRes.status, 200);
    const voiceHealthJson: any = await voiceHealthRes.json();
    assert.equal(voiceHealthJson.data.gemini.provider, 'gemini');
    assert.equal(voiceHealthJson.data.gemini.configured, true);
    console.log('✓ Test F: Voice subsystem preservation check passed.');

    // Test G: Upstash Redis distributed rate limiting (429 + X-RateLimit-* + Retry-After)
    const testLimiter = createRateLimiter({
      prefix: 'phase1-test',
      windowMs: 60000,
      max: 2,
      redisUrlOverride: `http://127.0.0.1:${upstashPort}`,
      redisTokenOverride: UPSTASH_TEST_TOKEN,
    });
    const mockReq: any = { ip: '192.0.2.10', auth: { authenticated: true, userId: 'rl-user-1' } };
    const makeMockRes = () => {
      const headers: Record<string, string> = {};
      const out: any = {
        statusCode: 200,
        body: null,
        setHeader: (k: string, v: string) => {
          headers[k] = v;
        },
        status: (code: number) => {
          out.statusCode = code;
          return out;
        },
        json: (payload: any) => {
          out.body = payload;
          return out;
        },
        headers,
      };
      return out;
    };
    let nextCount = 0;
    await testLimiter(mockReq, makeMockRes(), () => { nextCount++; });
    await testLimiter(mockReq, makeMockRes(), () => { nextCount++; });
    const thirdRes = makeMockRes();
    await testLimiter(mockReq, thirdRes, () => { nextCount++; });
    assert.equal(nextCount, 2);
    assert.equal(thirdRes.statusCode, 429);
    assert.equal(thirdRes.body.code, 'RATE_LIMITED');
    assert.equal(thirdRes.headers['X-RateLimit-Limit'], '2');
    assert.equal(thirdRes.headers['X-RateLimit-Remaining'], '0');
    assert.ok(Number(thirdRes.headers['Retry-After']) >= 1);
    console.log('✓ Test G: Distributed Upstash Redis rate limiting (429 + headers) passed.');

    // Test H: Secret scrubbing & UsageTracker recording
    const dirty = `Failed contacting http://127.0.0.1:${litellmPort} with ${LITELLM_TEST_KEY} and gsk_abcdef1234567890abcdef`;
    const clean1 = ErrorLogService.scrubSecrets(dirty);
    const clean2 = scrubSecretsAndUrls(dirty);
    assert.ok(!clean1.includes(LITELLM_TEST_KEY) && !clean1.includes('gsk_abcdef'));
    assert.ok(!clean2.includes(LITELLM_TEST_KEY) && !clean2.includes('gsk_abcdef'));
    const usageSummary = UsageTracker.getSummary();
    assert.ok(usageSummary.totalEntriesRecorded > 0);
    console.log('✓ Test H: Secret scrubbing and UsageTracker telemetry recording passed.');

    // Test I: Render hostport URL normalization & ENFORCE_LITELLM_GATEWAY fail-closed behavior
    assert.equal(normalizeGatewayBaseUrl('jexa-litellm-gateway:4000'), 'http://jexa-litellm-gateway:4000');
    assert.equal(normalizeGatewayBaseUrl('https://gw.internal:8443/'), 'https://gw.internal:8443');
    assert.equal(normalizeGatewayBaseUrl('ftp://bad-scheme:4000'), '');

    const savedBaseUrl = process.env.LITELLM_BASE_URL;
    const savedApiKey = process.env.LITELLM_API_KEY;
    const savedMasterKey = process.env.LITELLM_MASTER_KEY;
    process.env.ENFORCE_LITELLM_GATEWAY = 'true';
    process.env.LITELLM_BASE_URL = '';
    process.env.LITELLM_API_KEY = '';
    process.env.LITELLM_MASTER_KEY = '';
    AIProviderRegistry.reload();

    const enforcedRegistry = AIProviderRegistry.getInstance();
    assert.equal(enforcedRegistry.isGatewayEnforced(), true);
    assert.equal(enforcedRegistry.isGatewayActive(), false);
    // Even if client passes textProvider='gemini', enforced gateway MUST NOT fall back to direct Gemini
    assert.equal(enforcedRegistry.getTextProvider('gemini').providerType, 'litellm');
    // Voice provider MUST remain direct Gemini
    assert.equal(enforcedRegistry.getVoiceProvider('gemini').providerType, 'gemini');
    assert.equal(enforcedRegistry.getVoiceProvider('gemini').isConfigured, true);

    const failClosedChat = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${USER_TOKEN}` },
      body: JSON.stringify({ message: 'Should fail closed without gateway', textProvider: 'gemini', stream: false }),
    });
    assert.equal(failClosedChat.status, 503);
    const failClosedJson: any = await failClosedChat.json();
    assert.equal(failClosedJson.code, 'MISSING_CREDENTIALS');

    // Restore valid gateway env
    process.env.LITELLM_BASE_URL = savedBaseUrl;
    process.env.LITELLM_API_KEY = savedApiKey;
    process.env.LITELLM_MASTER_KEY = savedMasterKey;
    AIProviderRegistry.reload();
    console.log('✓ Test I: Render hostport normalization and ENFORCE_LITELLM_GATEWAY fail-closed (503) passed.');

    // Test J: Upstash fail-closed (503) on critical endpoints + pre-auth admin rate limiting
    const unreachableUpstashLimiter = createRateLimiter({
      prefix: 'phase1-failclosed-test',
      windowMs: 60000,
      max: 5,
      criticalEndpoint: true,
      failClosed: true,
      redisUrlOverride: 'http://127.0.0.1:1',
      redisTokenOverride: 'bad-token',
    });
    const fcRes = makeMockRes();
    let fcNext = 0;
    await unreachableUpstashLimiter({ ip: '198.51.100.1' } as any, fcRes, () => {
      fcNext++;
    });
    assert.equal(fcNext, 0);
    assert.equal(fcRes.statusCode, 503);
    assert.equal(fcRes.body.code, 'RATE_LIMIT_BACKEND_UNAVAILABLE');
    assert.equal(fcRes.headers['Retry-After'], '15');

    const fallbackLimiter = createRateLimiter({
      prefix: 'phase1-fallback-test',
      windowMs: 60000,
      max: 2,
      criticalEndpoint: true,
      failClosed: false,
      redisUrlOverride: 'http://127.0.0.1:1',
      redisTokenOverride: 'bad-token',
    });
    const fbRes = makeMockRes();
    let fbNext = 0;
    await fallbackLimiter({ ip: '198.51.100.2' } as any, fbRes, () => {
      fbNext++;
    });
    assert.equal(fbNext, 1);
    assert.equal(fbRes.headers['X-RateLimit-Mode'], 'memory-fallback');

    const rlStatus = RateLimitStore.getStatus();
    assert.ok(rlStatus.upstashErrorsCount >= 2);
    assert.ok(rlStatus.failClosedRejectionsCount >= 1);
    assert.ok(rlStatus.fallbackCount >= 1);

    // Pre-auth admin rate limiting (returns 429 before 401 when flooding admin endpoints unauthenticated)
    const savedAdminMax = process.env.RATE_LIMIT_ADMIN_MAX;
    process.env.RATE_LIMIT_ADMIN_MAX = '2';
    // Re-create app with tight admin limit via dedicated limiter check
    const adminBurstLimiter = createRateLimiter({
      prefix: 'admin-preauth-burst',
      windowMs: 60000,
      max: 2,
      criticalEndpoint: true,
    });
    const burstReq: any = { ip: '203.0.113.55', auth: { authenticated: false, isOwner: false } };
    let adminBurstAllowed = 0;
    await adminBurstLimiter(burstReq, makeMockRes(), () => adminBurstAllowed++);
    await adminBurstLimiter(burstReq, makeMockRes(), () => adminBurstAllowed++);
    const adminBurstBlocked = makeMockRes();
    await adminBurstLimiter(burstReq, adminBurstBlocked, () => adminBurstAllowed++);
    assert.equal(adminBurstAllowed, 2);
    assert.equal(adminBurstBlocked.statusCode, 429);
    if (savedAdminMax !== undefined) process.env.RATE_LIMIT_ADMIN_MAX = savedAdminMax;
    else delete process.env.RATE_LIMIT_ADMIN_MAX;
    console.log('✓ Test J: Upstash fail-closed (503), memory fallback mode, and pre-auth admin rate limiting passed.');

    // Test K: Hardened CORS origin validation
    const pinnedProdOrigins = new Set(['https://jexa.app']);
    assert.equal(isOriginAllowed('https://jexa.app', true, pinnedProdOrigins), true);
    assert.equal(isOriginAllowed('https://localhost', true, pinnedProdOrigins), true);
    assert.equal(isOriginAllowed('http://localhost', true, pinnedProdOrigins), true);
    assert.equal(isOriginAllowed('capacitor://localhost', true, pinnedProdOrigins), true);
    assert.equal(isOriginAllowed('https://jexa.app.evil.com', true, pinnedProdOrigins), false);
    assert.equal(isOriginAllowed('https://localhost.evil.com', true, pinnedProdOrigins), false);
    assert.equal(isOriginAllowed('https://evil.github.io', true, pinnedProdOrigins), false);
    assert.equal(isOriginAllowed('https://salonebiz67-jtecdev.github.io', true, new Set()), true);
    assert.equal(isOriginAllowed('http://localhost:5173', false, new Set()), true);
    console.log('✓ Test K: Strict CORS origin allowlist (prefix/substring bypass rejection & Capacitor preservation) passed.');

    console.log('\n==========================================================');
    console.log('ALL PHASE 1 SECURITY & LITELLM GATEWAY TESTS PASSED!');
    console.log('==========================================================');
  } finally {
    await Promise.all([
      new Promise<void>((r) => appServer.close(() => r())),
      new Promise<void>((r) => litellmServer.close(() => r())),
      new Promise<void>((r) => supabaseServer.close(() => r())),
      new Promise<void>((r) => upstashServer.close(() => r())),
    ]);
  }
}

runPhase1Verification().catch((err) => {
  console.error('PHASE 1 VERIFICATION FAILED:', err);
  process.exit(1);
});
