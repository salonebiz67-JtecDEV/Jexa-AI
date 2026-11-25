# JEXA — AI Companion Web & Android Application
> **Powered by JOHNEY TEC**

A production-ready consumer AI companion application architected with React, TypeScript, Capacitor Android support, a modular AI Brain, a private LiteLLM AI Gateway for text/reasoning/tool-calling, direct Gemini Neural Voice (TTS + Live), distributed Upstash Redis rate limiting, Supabase Owner authentication, and device-local IndexedDB chat storage.

Designed for automated deployment: **Frontend on GitHub Pages** (via GitHub Actions) + **Android APK (Capacitor)**, and **Backend + Private LiteLLM Gateway on Render**.

---

## 🌟 System Architecture

```
┌──────────────────────────────────────────────┐
│  GITHUB PAGES / CAPACITOR ANDROID FRONTEND   │
│  - Consumer Chat, Sidebar & Voice Orb        │
│  - Device-local IndexedDB Chat Persistence   │
│  - In-memory Access Token + HttpOnly Refresh │
│  - Zero AI Keys or Gateway URLs in Bundle    │
└──────────────────────┬───────────────────────┘
                       │ HTTPS REST / SSE (Exact CORS Allowlist)
                       ▼
┌──────────────────────────────────────────────┐
│        JEXA RENDER PUBLIC BACKEND            │
│  - Express API (/api/*) + Security Headers   │
│  - Supabase Auth Verification & Owner RBAC   │
│  - Upstash Redis Distributed Rate Limiter    │
│  - Zod Request Validation & Audit Logging    │
│  - Direct Gemini Live & Neural Voice TTS     │
└──────────────────────┬───────────────────────┘
                       │ Render Private Network (ENFORCE_LITELLM_GATEWAY=true)
                       ▼
┌──────────────────────────────────────────────┐
│       PRIVATE LITELLM AI GATEWAY (pserv)     │
│  - Dockerized LiteLLM (litellm/Dockerfile)   │
│  - Logical Model Aliases & Acyclic Fallbacks │
│  - Google Gemini + Groq Upstream Routing     │
│  - Privacy No-Cache / No-Spend-Prompt Logs   │
└──────────────────────────────────────────────┘
```

---

## 🔒 Security & Infrastructure Highlights

1. **Private LiteLLM Gateway (`litellm/config.yaml`, `litellm/Dockerfile`)**:
   - Text chat, tool-calling, and background classification route through the private Render Docker service `jexa-litellm-gateway` (no public URL).
   - `ENFORCE_LITELLM_GATEWAY=true` fails closed (`503`) rather than silently bypassing the gateway if LiteLLM credentials are missing.
   - Gemini Voice TTS and Live Voice remain direct on Gemini for low-latency audio synthesis.
2. **Owner Authentication & Admin RBAC**:
   - Administrative, usage, tool, provider, and security endpoints (`/api/usage/*`, `/api/tools/*`, `/api/providers/select`, `/api/providers/test-*`, `/api/voice/test`, `POST /api/ai/brain-profile`, `/api/security/*`) strictly require a verified Supabase owner account (`OWNER_USER_ID` or verified `OWNER_EMAIL`).
   - Short-TTL verification cache (`AUTH_CACHE_TTL_MS`, default 5s) dynamically re-evaluates owner binding and evicts sessions immediately on logout/refresh.
3. **Distributed Rate Limiting (Upstash Redis)**:
   - Pre-auth rate limiting protects login, chat, voice, and admin endpoints.
   - `RATE_LIMIT_FAIL_CLOSED=true` fails closed (`503`) on critical endpoints if Upstash becomes unreachable in production.
4. **Durable Security Audit Logs (`supabase/security_audit_logs.sql`)**:
   - Authentication, blocked unauthorized admin requests, rate-limiter degradations, and configuration changes are persisted to Supabase (`jexa_security_audit_logs` with strict RLS) when `SUPABASE_SERVICE_ROLE_KEY` is configured, with honest durability telemetry in the Security tab.
5. **Exact CORS Enforcement**:
   - Validates browser `Origin` headers against parsed exact `FRONTEND_URL` / `CORS_ORIGIN` / `CORS_ALLOWED_ORIGINS` allowlists and Capacitor native WebView origins (`https://localhost`, `http://localhost`, `capacitor://localhost`).

---

## 🚀 GitHub Pages Frontend Deployment (Automated)

The frontend deploys automatically to **GitHub Pages** on every push to `main` or `master` via `.github/workflows/deploy.yml`.

### Repository Setup for GitHub Pages:
1. Go to your repository on GitHub → **Settings** → **Pages** → **Source**: select **GitHub Actions**.
2. In **Settings** → **Secrets and variables** → **Actions** → **Variables**:
   - Add `VITE_API_BASE_URL` = your deployed Render backend URL (e.g., `https://jexa-ai-companion.onrender.com`).
   - **Never** put API keys, `LITELLM_*`, `UPSTASH_*`, or `SUPABASE_SERVICE_ROLE_KEY` in `VITE_*` variables.

---

## ☁️ Render Deployment (Backend + Private LiteLLM Gateway)

`render.yaml` provisions two Render services:
1. **`jexa-litellm-gateway`** (`type: pserv`, Docker `./litellm/Dockerfile`, internal port `4000`)
2. **`jexa-ai-companion`** (`type: web`, Node, `npm install && npm run build` / `npm run start`, health check `/health`)

### Required Render Secret Environment Variables:
Configure these in Render Dashboard (never commit real secrets to Git):

**On `jexa-litellm-gateway`:**
- `LITELLM_MASTER_KEY` (generate a strong random secret, e.g. `sk-...`)
- `GEMINI_API_KEY`
- `GROQ_API_KEY` (optional, enables Groq fallback aliases)

**On `jexa-ai-companion`:**
- `LITELLM_BASE_URL` (auto-linked in `render.yaml` via `fromService` `hostport`)
- `LITELLM_API_KEY` & `LITELLM_MASTER_KEY` (must match gateway `LITELLM_MASTER_KEY`)
- `ENFORCE_LITELLM_GATEWAY=true`
- `GEMINI_API_KEY` (used for Gemini Voice TTS / Live)
- `TAVILY_API_KEY` (for `web_search` tool)
- `FRONTEND_URL` (exact origin, e.g. `https://<username>.github.io`)
- `UPSTASH_REDIS_REST_URL` & `UPSTASH_REDIS_REST_TOKEN`
- `RATE_LIMIT_FAIL_CLOSED=true`
- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- `OWNER_USER_ID` (your confirmed Supabase User UUID)

### Supabase Audit Table Setup (One-Time):
Run `supabase/security_audit_logs.sql` in your Supabase SQL Editor to create `public.jexa_security_audit_logs` with strict Row Level Security (`service_role` only).

---

## 💻 Local Development

1. Install dependencies:
   ```bash
   npm install
   ```
2. Copy environment template and fill local test keys:
   ```bash
   cp .env.example .env
   ```
3. Start the full-stack development server on port `3000`:
   ```bash
   npm run dev
   ```
4. Verify TypeScript, production build, and security/regression tests:
   ```bash
   npm run lint
   npm run build
   npx tsx scripts/test-phase1-security-litellm.ts
   npx tsx scripts/test-phase2-owner-auth.ts
   ```

---

## 📄 License
Created and Engineered by **JOHNEY TEC**.
