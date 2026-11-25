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

function extractCookieValue(setCookieHeader: string | null, cookieName: string): string | null {
  if (!setCookieHeader) return null;
  const regex = new RegExp(`(?:^|,\\s*)${cookieName}=([^;]+)`);
  const match = setCookieHeader.match(regex);
  return match ? decodeURIComponent(match[1]) : null;
}

async function runPhase2Verification(): Promise<void> {
  console.log('==========================================================');
  console.log('JEXA PHASE 2: OWNER AUTHENTICATION & ADMIN SECURITY SUITE');
  console.log('==========================================================\n');

  const LITELLM_TEST_KEY = 'sk-litellm-phase2-secret-key-445566';
  const SUPABASE_TEST_ANON = 'sb-anon-phase2-test-key-445566';

  const OWNER_EMAIL = 'owner@jexa.local';
  const OWNER_PASSWORD = 'OwnerSuperSecretPassword!2026';
  const USER_EMAIL = 'user@jexa.local';
  const USER_PASSWORD = 'RegularUserPassword!2026';
  const IMPOSTOR_EMAIL = 'impostor@jexa.local';
  const IMPOSTOR_PASSWORD = 'ImpostorPassword!2026';

  let ownerAccessToken = makeFakeJwt('owner-user-1', 3600);
  const ownerRefreshToken = 'refresh_owner_secret_token_alpha_112233';
  const ownerRotatedAccessToken = makeFakeJwt('owner-user-1', 7200);
  const ownerRotatedRefreshToken = 'refresh_owner_secret_token_beta_445566';

  const userAccessToken = makeFakeJwt('regular-user-2', 3600);
  const userRefreshToken = 'refresh_user_secret_token_gamma_778899';

  const impostorAccessToken = makeFakeJwt('impostor-user-99', 3600);
  const impostorRefreshToken = 'refresh_impostor_secret_token_990011';

  const expiredToken = makeFakeJwt('owner-user-1', -300);

  const SUPABASE_SERVICE_ROLE = 'sb-service-role-phase2-secret-key-889900';
  const revokedUpstreamTokens = new Set<string>();
  const lastGatewayPayloads: any[] = [];
  const persistedAuditRows: any[] = [];

  // 1. Local LiteLLM Gateway simulator
  const litellmServer = http.createServer(async (req, res) => {
    if (req.url === '/health/liveliness' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'alive' }));
      return;
    }

    if (req.url === '/v1/models' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ data: [{ id: 'jexa-chat-primary' }, { id: 'jexa-chat-backup' }] }));
      return;
    }

    if (req.url === '/v1/chat/completions' && req.method === 'POST') {
      const body = await readJsonBody(req);
      lastGatewayPayloads.push(body);
      const stream = Boolean(body?.stream);
      const replyText = 'Phase 2 chat verified cleanly.';

      if (stream) {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
        });
        res.write(
          `data: ${JSON.stringify({
            id: 'chatcmpl-p2-stream',
            model: 'gemini/gemini-3.8-flash',
            choices: [{ index: 0, delta: { content: replyText }, finish_reason: 'stop' }],
            usage: { prompt_tokens: 25, completion_tokens: 8, total_tokens: 33 },
          })}\n\n`
        );
        res.write('data: [DONE]\n\n');
        res.end();
        return;
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          id: 'chatcmpl-p2-1',
          model: 'gemini/gemini-3.8-flash',
          choices: [
            {
              index: 0,
              finish_reason: 'stop',
              message: { role: 'assistant', content: replyText },
            },
          ],
          usage: { prompt_tokens: 22, completion_tokens: 7, total_tokens: 29 },
        })
      );
      return;
    }

    res.writeHead(404);
    res.end();
  });

  // 2. Local Supabase Auth simulator
  const supabaseServer = http.createServer(async (req, res) => {
    const reqUrl = new URL(req.url || '/', 'http://127.0.0.1');

    if (reqUrl.pathname === '/auth/v1/token' && req.method === 'POST') {
      const grantType = reqUrl.searchParams.get('grant_type');
      const body = await readJsonBody(req);

      if (grantType === 'password') {
        if (body?.email === OWNER_EMAIL && body?.password === OWNER_PASSWORD) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              access_token: ownerAccessToken,
              refresh_token: ownerRefreshToken,
              expires_in: 3600,
              user: {
                id: 'owner-user-1',
                email: OWNER_EMAIL,
                email_confirmed_at: '2026-01-01T00:00:00Z',
                app_metadata: { role: 'owner' },
                user_metadata: { role: 'user' },
              },
            })
          );
          return;
        }

        if (body?.email === USER_EMAIL && body?.password === USER_PASSWORD) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              access_token: userAccessToken,
              refresh_token: userRefreshToken,
              expires_in: 3600,
              user: {
                id: 'regular-user-2',
                email: USER_EMAIL,
                email_confirmed_at: '2026-01-01T00:00:00Z',
                app_metadata: { role: 'user' },
                // Attempted client-editable privilege escalation via user_metadata
                user_metadata: { role: 'owner', isOwner: true },
              },
            })
          );
          return;
        }

        if (body?.email === IMPOSTOR_EMAIL && body?.password === IMPOSTOR_PASSWORD) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              access_token: impostorAccessToken,
              refresh_token: impostorRefreshToken,
              expires_in: 3600,
              user: {
                id: 'impostor-user-99',
                email: IMPOSTOR_EMAIL,
                email_confirmed_at: '2026-01-01T00:00:00Z',
                // Even if another account had app_metadata.role='owner', OWNER_USER_ID pin must reject it
                app_metadata: { role: 'owner' },
                user_metadata: { role: 'owner' },
              },
            })
          );
          return;
        }

        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'invalid_grant', error_description: 'Invalid login credentials' }));
        return;
      }

      if (grantType === 'refresh_token') {
        if (body?.refresh_token === ownerRefreshToken) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              access_token: ownerRotatedAccessToken,
              refresh_token: ownerRotatedRefreshToken,
              expires_in: 7200,
              user: {
                id: 'owner-user-1',
                email: OWNER_EMAIL,
                email_confirmed_at: '2026-01-01T00:00:00Z',
                app_metadata: { role: 'owner' },
              },
            })
          );
          return;
        }
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'invalid_grant', error_description: 'Refresh token expired' }));
        return;
      }
    }

    if (reqUrl.pathname === '/auth/v1/user' && req.method === 'GET') {
      const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
      if (revokedUpstreamTokens.has(token)) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'session_revoked' }));
        return;
      }

      if (token === ownerAccessToken || token === ownerRotatedAccessToken) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            id: 'owner-user-1',
            email: OWNER_EMAIL,
            email_confirmed_at: '2026-01-01T00:00:00Z',
            app_metadata: { role: 'owner' },
          })
        );
        return;
      }

      if (token === userAccessToken) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            id: 'regular-user-2',
            email: USER_EMAIL,
            email_confirmed_at: '2026-01-01T00:00:00Z',
            app_metadata: { role: 'user' },
            user_metadata: { role: 'owner' },
          })
        );
        return;
      }

      if (token === impostorAccessToken) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            id: 'impostor-user-99',
            email: IMPOSTOR_EMAIL,
            email_confirmed_at: '2026-01-01T00:00:00Z',
            app_metadata: { role: 'owner' },
            user_metadata: { role: 'owner' },
          })
        );
        return;
      }

      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'invalid_token' }));
      return;
    }

    if (reqUrl.pathname === '/auth/v1/logout' && req.method === 'POST') {
      const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
      if (token) revokedUpstreamTokens.add(token);
      res.writeHead(204);
      res.end();
      return;
    }

    if (reqUrl.pathname === '/rest/v1/jexa_security_audit_logs') {
      const authHeader = req.headers.authorization || '';
      const apiKeyHeader = req.headers.apikey || '';
      if (authHeader !== `Bearer ${SUPABASE_SERVICE_ROLE}` || apiKeyHeader !== SUPABASE_SERVICE_ROLE) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ message: 'Service role required by RLS policy' }));
        return;
      }

      if (req.method === 'POST') {
        const row = await readJsonBody(req);
        if (row && row.id) {
          persistedAuditRows.push(row);
        }
        res.writeHead(201);
        res.end();
        return;
      }

      if (req.method === 'GET') {
        const eventTypeFilter = reqUrl.searchParams.get('event_type')?.replace(/^eq\./, '');
        const limitVal = Number(reqUrl.searchParams.get('limit')) || 100;
        const rows = persistedAuditRows
          .filter((r) => !eventTypeFilter || r.event_type === eventTypeFilter)
          .sort((a, b) => Number(b.timestamp_ms) - Number(a.timestamp_ms))
          .slice(0, limitVal);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(rows));
        return;
      }
    }

    res.writeHead(404);
    res.end();
  });

  await Promise.all([
    new Promise<void>((r) => litellmServer.listen(0, '127.0.0.1', r)),
    new Promise<void>((r) => supabaseServer.listen(0, '127.0.0.1', r)),
  ]);

  const litellmPort = (litellmServer.address() as AddressInfo).port;
  const supabasePort = (supabaseServer.address() as AddressInfo).port;

  // Set server-side env config (strict OWNER_USER_ID pinning, chat remains open for guests/users)
  process.env.LITELLM_BASE_URL = `http://127.0.0.1:${litellmPort}`;
  process.env.LITELLM_API_KEY = LITELLM_TEST_KEY;
  process.env.LITELLM_MASTER_KEY = LITELLM_TEST_KEY;
  process.env.SUPABASE_URL = `http://127.0.0.1:${supabasePort}`;
  process.env.SUPABASE_ANON_KEY = SUPABASE_TEST_ANON;
  process.env.SUPABASE_SERVICE_ROLE_KEY = SUPABASE_SERVICE_ROLE;
  process.env.OWNER_USER_ID = 'owner-user-1';
  delete process.env.OWNER_EMAIL;
  process.env.REQUIRE_AUTH_FOR_CHAT = 'false';
  process.env.GEMINI_API_KEY = 'AIzaSyDummyPhase2VerificationKey1234567890';
  process.env.RATE_LIMIT_AUTH_MAX = '12';
  process.env.RATE_LIMIT_ADMIN_MAX = '100';

  const { AIProviderRegistry } = await import('../ai/providers/registry');
  const { RateLimitStore } = await import('../backend/src/middleware/rate-limit.middleware');
  const { SupabaseAuthService } = await import('../backend/src/services/supabase-auth.service');
  const { SecurityAuditService } = await import('../backend/src/services/security-audit.service');
  const { createApp } = await import('../server');

  AIProviderRegistry.reload();
  RateLimitStore.clearMemory();
  SupabaseAuthService.clearCache();
  SecurityAuditService.clear();

  const app = createApp({ includeErrorHandler: true });
  const appServer = http.createServer(app);
  await new Promise<void>((r) => appServer.listen(0, '127.0.0.1', r));
  const appPort = (appServer.address() as AddressInfo).port;
  const baseUrl = `http://127.0.0.1:${appPort}`;

  const adminEndpoints: Array<{ method: 'GET' | 'POST'; path: string; body?: Record<string, any> }> = [
    { method: 'GET', path: '/api/usage/summary' },
    { method: 'GET', path: '/api/tools/status' },
    { method: 'POST', path: '/api/tools/toggle', body: { toolName: 'system_time', enabled: true } },
    { method: 'POST', path: '/api/tools/test', body: { toolName: 'system_time' } },
    { method: 'POST', path: '/api/providers/select', body: { textModel: 'gemini-3.8-flash' } },
    { method: 'POST', path: '/api/providers/test-text', body: { model: 'gemini-3.8-flash' } },
    { method: 'POST', path: '/api/providers/test-voice', body: { model: 'gemini-3.8-flash-lite-tts' } },
    { method: 'POST', path: '/api/voice/test', body: { model: 'gemini-3.8-flash-lite-tts' } },
    { method: 'POST', path: '/api/ai/brain-profile', body: { theme: 'dark' } },
    { method: 'GET', path: '/api/security/audit-logs' },
    { method: 'GET', path: '/api/security/status' },
  ];

  try {
    // -----------------------------------------------------------------------
    // Scenario 1: Owner logs in
    // -----------------------------------------------------------------------
    const ownerLoginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: OWNER_EMAIL, password: OWNER_PASSWORD }),
    });
    assert.equal(ownerLoginRes.status, 200);
    assert.equal(ownerLoginRes.headers.get('cache-control'), 'no-store');
    const ownerLoginSetCookie = ownerLoginRes.headers.get('set-cookie');
    assert.ok(ownerLoginSetCookie && ownerLoginSetCookie.includes('HttpOnly'), 'Refresh cookie must be HttpOnly');
    assert.ok(ownerLoginSetCookie.includes('Path=/api/auth'), 'Refresh cookie must be scoped to /api/auth');
    const initialRefreshCookie = extractCookieValue(ownerLoginSetCookie, 'jexa_refresh_token');
    assert.equal(initialRefreshCookie, ownerRefreshToken);

    const ownerLoginJson: any = await ownerLoginRes.json();
    assert.equal(ownerLoginJson.success, true);
    assert.equal(ownerLoginJson.data.authenticated, true);
    assert.equal(ownerLoginJson.data.accessToken, ownerAccessToken);
    assert.equal(ownerLoginJson.data.user.isOwner, true);
    assert.equal(ownerLoginJson.data.user.role, 'owner');
    assert.equal(ownerLoginJson.data.refreshToken, undefined, 'Refresh token must NOT be exposed in JSON body');
    assert.ok(!JSON.stringify(ownerLoginJson).includes(ownerRefreshToken));
    console.log('✓ Scenario 1: Owner login succeeds with HttpOnly cookie and no-store cache headers.');

    // -----------------------------------------------------------------------
    // Scenario 2: Owner accesses protected admin endpoints
    // -----------------------------------------------------------------------
    for (const ep of adminEndpoints) {
      const res = await fetch(`${baseUrl}${ep.path}`, {
        method: ep.method,
        headers: {
          Authorization: `Bearer ${ownerAccessToken}`,
          ...(ep.body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: ep.body ? JSON.stringify(ep.body) : undefined,
      });
      // provider/voice test endpoints may return 200 or 502 depending on dummy GEMINI_API_KEY upstream, never 401/403
      assert.notEqual(res.status, 401, `Owner should not get 401 on ${ep.method} ${ep.path}`);
      assert.notEqual(res.status, 403, `Owner should not get 403 on ${ep.method} ${ep.path}`);
    }
    console.log('✓ Scenario 2: Verified owner accesses all protected administrative endpoints.');

    // -----------------------------------------------------------------------
    // Scenario 3: Unauthenticated user gets 401 on protected admin endpoints
    // -----------------------------------------------------------------------
    for (const ep of adminEndpoints) {
      const res = await fetch(`${baseUrl}${ep.path}`, {
        method: ep.method,
        headers: ep.body ? { 'Content-Type': 'application/json' } : undefined,
        body: ep.body ? JSON.stringify(ep.body) : undefined,
      });
      assert.equal(res.status, 401, `Expected 401 unauthenticated on ${ep.method} ${ep.path}`);
    }
    console.log('✓ Scenario 3: Unauthenticated user receives 401 on all protected admin endpoints.');

    // -----------------------------------------------------------------------
    // Scenario 4: Normal user logs in and gets 403 on protected admin endpoints
    // -----------------------------------------------------------------------
    const userLoginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: USER_EMAIL, password: USER_PASSWORD }),
    });
    assert.equal(userLoginRes.status, 200);
    const userLoginJson: any = await userLoginRes.json();
    assert.equal(userLoginJson.data.user.isOwner, false);
    assert.equal(userLoginJson.data.user.role, 'user');

    for (const ep of adminEndpoints) {
      const res = await fetch(`${baseUrl}${ep.path}`, {
        method: ep.method,
        headers: {
          Authorization: `Bearer ${userAccessToken}`,
          ...(ep.body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: ep.body ? JSON.stringify(ep.body) : undefined,
      });
      assert.equal(res.status, 403, `Expected 403 non-owner on ${ep.method} ${ep.path}`);
    }
    console.log('✓ Scenario 4: Normal user receives 403 on all protected admin endpoints.');

    // -----------------------------------------------------------------------
    // Scenario 5: Forged owner role attempts are rejected
    // -----------------------------------------------------------------------
    // 5a. Attempt to pass role/isOwner in login payload
    const forgedLoginPayload = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: USER_EMAIL,
        password: USER_PASSWORD,
        role: 'owner',
        isOwner: true,
      }),
    });
    assert.equal(forgedLoginPayload.status, 400);

    // 5b. Attempt to spoof owner headers while unauthenticated or logged in as user
    const spoofedHeaderUnauth = await fetch(`${baseUrl}/api/usage/summary`, {
      headers: {
        'x-user-role': 'owner',
        'x-user-id': 'owner-user-1',
        'x-owner': 'true',
      },
    });
    assert.equal(spoofedHeaderUnauth.status, 401);

    const spoofedHeaderUser = await fetch(`${baseUrl}/api/usage/summary`, {
      headers: {
        Authorization: `Bearer ${userAccessToken}`,
        'x-user-role': 'owner',
        'x-user-id': 'owner-user-1',
      },
    });
    assert.equal(spoofedHeaderUser.status, 403);

    // 5c. Account with app_metadata.role='owner' whose user ID != OWNER_USER_ID must be denied owner access
    const impostorLoginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: IMPOSTOR_EMAIL, password: IMPOSTOR_PASSWORD }),
    });
    assert.equal(impostorLoginRes.status, 200);
    const impostorLoginJson: any = await impostorLoginRes.json();
    assert.equal(impostorLoginJson.data.user.isOwner, false);
    assert.equal(impostorLoginJson.data.user.role, 'user');

    const impostorAdminRes = await fetch(`${baseUrl}/api/security/audit-logs`, {
      headers: { Authorization: `Bearer ${impostorAccessToken}` },
    });
    assert.equal(impostorAdminRes.status, 403);
    console.log('✓ Scenario 5: Forged owner role, spoofed headers, user_metadata, and unpinned ID attempts rejected.');

    // -----------------------------------------------------------------------
    // Scenario 6: Expired access token is rejected
    // -----------------------------------------------------------------------
    const expiredAdmin = await fetch(`${baseUrl}/api/usage/summary`, {
      headers: { Authorization: `Bearer ${expiredToken}` },
    });
    assert.equal(expiredAdmin.status, 401);

    const expiredSession = await fetch(`${baseUrl}/api/auth/session`, {
      headers: { Authorization: `Bearer ${expiredToken}` },
    });
    assert.equal(expiredSession.status, 401);

    const expiredChat = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${expiredToken}` },
      body: JSON.stringify({ message: 'Hello' }),
    });
    assert.equal(expiredChat.status, 401);
    console.log('✓ Scenario 6: Expired access tokens rejected with 401 across admin, session, and chat routes.');

    // -----------------------------------------------------------------------
    // Scenario 7: Invalid / malformed access token is rejected
    // -----------------------------------------------------------------------
    for (const badToken of ['bad', 'eyJ.tampered.sig', makeFakeJwt('unknown-user-000')]) {
      const badAdmin = await fetch(`${baseUrl}/api/tools/status`, {
        headers: { Authorization: `Bearer ${badToken}` },
      });
      assert.equal(badAdmin.status, 401, `Expected 401 for bad token "${badToken.slice(0, 12)}"`);
    }
    console.log('✓ Scenario 7: Invalid and malformed access tokens rejected with 401.');

    // -----------------------------------------------------------------------
    // Scenario 8: Normal user & guest chat + voice still work, with sensitive tools restricted
    // -----------------------------------------------------------------------
    lastGatewayPayloads.length = 0;

    // Guest (unauthenticated) chat
    const guestChatRes = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Hi Jexa as a guest!', stream: false }),
    });
    assert.equal(guestChatRes.status, 200);
    const guestChatJson: any = await guestChatRes.json();
    assert.equal(guestChatJson.success, true);

    // Standard authenticated user streaming chat
    const userStreamRes = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        Authorization: `Bearer ${userAccessToken}`,
      },
      body: JSON.stringify({ message: 'Hi Jexa as a regular user!', stream: true }),
    });
    assert.equal(userStreamRes.status, 200);
    const sseBody = await userStreamRes.text();
    assert.ok(sseBody.includes('"type":"complete"'));

    // Verify sensitive diagnostic tools (system_check, read_source_file, etc.) were NOT passed to the model for guest/user
    assert.ok(lastGatewayPayloads.length >= 2);
    for (const payload of lastGatewayPayloads) {
      const sentToolNames = (payload?.tools || []).map((t: any) => t?.function?.name);
      assert.ok(!sentToolNames.includes('system_check'), 'system_check must not be exposed to non-owners');
      assert.ok(!sentToolNames.includes('recent_errors'), 'recent_errors must not be exposed to non-owners');
      assert.ok(!sentToolNames.includes('read_source_file'), 'read_source_file must not be exposed to non-owners');
      assert.ok(!sentToolNames.includes('search_code'), 'search_code must not be exposed to non-owners');
    }

    // Voice health works normally
    const voiceHealth = await fetch(`${baseUrl}/api/voice/health`);
    assert.equal(voiceHealth.status, 200);

    // Non-owner provider status should not expose diagnostic error strings
    const nonOwnerStatusRes = await fetch(`${baseUrl}/api/providers/status`);
    assert.equal(nonOwnerStatusRes.status, 200);
    console.log('✓ Scenario 8: Normal user & guest chat/voice work cleanly while sensitive diagnostic tools remain hidden.');

    // -----------------------------------------------------------------------
    // Scenario 9: Session restoration, logout revocation, and audit log sanitization
    // -----------------------------------------------------------------------
    // Restore session using HttpOnly refresh cookie
    const refreshRes = await fetch(`${baseUrl}/api/auth/refresh`, {
      method: 'POST',
      headers: {
        Cookie: `jexa_refresh_token=${encodeURIComponent(initialRefreshCookie)}`,
      },
    });
    assert.equal(refreshRes.status, 200);
    const refreshJson: any = await refreshRes.json();
    assert.equal(refreshJson.data.accessToken, ownerRotatedAccessToken);
    assert.equal(refreshJson.data.user.isOwner, true);
    const rotatedCookie = extractCookieValue(refreshRes.headers.get('set-cookie'), 'jexa_refresh_token');
    assert.equal(rotatedCookie, ownerRotatedRefreshToken);

    // Log out owner cleanly and verify immediate token invalidation
    const logoutRes = await fetch(`${baseUrl}/api/auth/logout`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ownerRotatedAccessToken}` },
    });
    assert.equal(logoutRes.status, 200);
    const logoutSetCookie = logoutRes.headers.get('set-cookie') || '';
    assert.ok(logoutSetCookie.includes('Max-Age=0'), 'Logout must clear HttpOnly refresh cookie');

    // Reusing the logged-out access token immediately returns 401
    const postLogoutAdmin = await fetch(`${baseUrl}/api/usage/summary`, {
      headers: { Authorization: `Bearer ${ownerRotatedAccessToken}` },
    });
    assert.equal(postLogoutAdmin.status, 401);

    // Log back in with a fresh owner token to inspect audit logs
    ownerAccessToken = makeFakeJwt('owner-user-1', 5400);
    const reloginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: OWNER_EMAIL, password: OWNER_PASSWORD }),
    });
    assert.equal(reloginRes.status, 200);
    const reloginJson: any = await reloginRes.json();
    const freshOwnerToken = reloginJson.data.accessToken;

    // Trigger one intentional failed login to check audit logging
    const badCredRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: OWNER_EMAIL, password: 'WrongPassword!123' }),
    });
    assert.equal(badCredRes.status, 401);

    await SecurityAuditService.flushPendingWrites();
    assert.ok(persistedAuditRows.length > 0, 'Expected security audit events to persist to Supabase PostgREST');

    // Wipe in-memory audit buffer to prove durable recovery from Supabase PostgREST
    SecurityAuditService.clear();
    const auditRes = await fetch(`${baseUrl}/api/security/audit-logs?limit=200`, {
      headers: { Authorization: `Bearer ${freshOwnerToken}` },
    });
    assert.equal(auditRes.status, 200);
    const auditJson: any = await auditRes.json();
    assert.equal(auditJson.data.durability.mode, 'supabase_durable');
    assert.equal(auditJson.data.durability.durableConfigured, true);
    const eventTypes = new Set((auditJson.data.events || []).map((e: any) => e.eventType));
    assert.ok(eventTypes.has('owner_login_success'));
    assert.ok(eventTypes.has('user_login_success'));
    assert.ok(eventTypes.has('auth_login_failed'));
    assert.ok(eventTypes.has('unauthorized_admin_access'));
    assert.ok(eventTypes.has('session_restored'));
    assert.ok(eventTypes.has('owner_logout'));
    assert.ok(eventTypes.has('gateway_config_changed') || eventTypes.has('provider_config_changed'));
    assert.ok(eventTypes.has('brain_profile_changed'));
    assert.ok(eventTypes.has('tool_toggled'));

    // Ensure ZERO passwords, tokens, or secrets appear anywhere in audit log payload
    const auditSerialized = JSON.stringify(auditJson);
    assert.ok(!auditSerialized.includes(OWNER_PASSWORD));
    assert.ok(!auditSerialized.includes(USER_PASSWORD));
    assert.ok(!auditSerialized.includes('WrongPassword!123'));
    assert.ok(!auditSerialized.includes(ownerRefreshToken));
    assert.ok(!auditSerialized.includes(ownerRotatedRefreshToken));
    assert.ok(!auditSerialized.includes(freshOwnerToken));
    assert.ok(!auditSerialized.includes(LITELLM_TEST_KEY));
    assert.ok(!auditSerialized.includes(SUPABASE_SERVICE_ROLE));

    // Verify /api/security/status returns live gateway health, Upstash status, durability, and zero leaked URLs/keys
    const secStatusRes = await fetch(`${baseUrl}/api/security/status`, {
      headers: { Authorization: `Bearer ${freshOwnerToken}` },
    });
    assert.equal(secStatusRes.status, 200);
    const secStatusJson: any = await secStatusRes.json();
    assert.equal(secStatusJson.data.gateway.reachable, true);
    assert.equal(secStatusJson.data.auditPersistence.mode, 'supabase_durable');
    assert.ok(typeof secStatusJson.data.auth.cacheTtlMs === 'number');
    assert.ok(!JSON.stringify(secStatusJson).includes(LITELLM_TEST_KEY));
    assert.ok(!JSON.stringify(secStatusJson).includes(SUPABASE_SERVICE_ROLE));
    assert.ok(!JSON.stringify(secStatusJson).includes(`127.0.0.1:${litellmPort}`));
    assert.ok(!JSON.stringify(secStatusJson).includes(`127.0.0.1:${supabasePort}`));

    // Verify cached token verification dynamically re-evaluates OWNER_USER_ID if config changes
    const preChangeCheck = await SupabaseAuthService.verifyAccessToken(freshOwnerToken);
    assert.equal(preChangeCheck.valid, true);
    assert.equal(preChangeCheck.user?.isOwner, true);
    process.env.OWNER_USER_ID = 'different-owner-uuid';
    const postChangeCheck = await SupabaseAuthService.verifyAccessToken(freshOwnerToken);
    assert.equal(postChangeCheck.valid, true);
    assert.equal(postChangeCheck.user?.isOwner, false, 'Cached verification must re-evaluate owner config dynamically');
    process.env.OWNER_USER_ID = 'owner-user-1';

    // Verify SQL migration enforces RLS and revokes anon/authenticated access
    const fs = await import('node:fs');
    const path = await import('node:path');
    const sqlText = fs.readFileSync(path.resolve(process.cwd(), 'supabase/security_audit_logs.sql'), 'utf8');
    assert.ok(sqlText.includes('ENABLE ROW LEVEL SECURITY'));
    assert.ok(sqlText.includes('REVOKE ALL ON TABLE public.jexa_security_audit_logs FROM anon, authenticated'));

    console.log('✓ Scenario 9: Refresh cookie restoration, logout revocation, durable Supabase audit logs (RLS), security status, and dynamic cache re-eval verified.');

    // -----------------------------------------------------------------------
    // Scenario 10: Auth endpoint rate limiting (429)
    // -----------------------------------------------------------------------
    let hitRateLimit429 = false;
    for (let i = 0; i < 15; i++) {
      const rlRes = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: OWNER_EMAIL, password: 'WrongPasswordCheckLimit' }),
      });
      if (rlRes.status === 429) {
        hitRateLimit429 = true;
        assert.ok(rlRes.headers.get('retry-after'));
        break;
      }
    }
    assert.equal(hitRateLimit429, true, 'Expected 429 rate limiting on repeated auth attempts');
    console.log('✓ Scenario 10: Auth brute-force rate limiting (429 + Retry-After) passed.');

    console.log('\n==========================================================');
    console.log('ALL 10 PHASE 2 OWNER AUTH & SECURITY SCENARIOS PASSED!');
    console.log('==========================================================');
  } finally {
    await Promise.all([
      new Promise<void>((r) => appServer.close(() => r())),
      new Promise<void>((r) => litellmServer.close(() => r())),
      new Promise<void>((r) => supabaseServer.close(() => r())),
    ]);
  }
}

runPhase2Verification().catch((err) => {
  console.error('PHASE 2 VERIFICATION FAILED:', err);
  process.exit(1);
});
