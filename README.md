# JEXA — AI Companion Web Application
> **Powered by JOHNEY TEC**

A production-ready, full-stack AI companion application architected with React, TypeScript, Node.js, Express, a modular AI Brain, independent Text & Voice provider abstractions, and a Supabase persistent memory foundation.

---

## 🌟 Architecture Overview

```
jexa-ai-companion/
├── ai/                      # Decoupled AI Cognitive Core
│   ├── brain/              # Identity, Personality, Behavior, Context Handler
│   ├── memory/             # Short-term buffer, Long-term storage & Retrieval
│   ├── prompts/            # Composable System, Chat, Voice & Memory Prompts
│   └── providers/          # Text AI & Voice AI Provider Abstractions & Registry
├── backend/                # Production Node.js + Express Backend
│   └── src/
│       ├── controllers/    # Route controllers (Chat, Voice, Memories, etc.)
│       ├── database/       # Supabase client, SQL schema, DatabaseService layer
│       ├── middleware/     # CORS, JSON parsing, central error handling
│       ├── routes/         # REST API endpoints (/api/*)
│       └── services/       # Chat orchestration, Voice, Memory processing
├── src/                    # Premium Mobile-First React Frontend
│   ├── components/         # Chat, Voice, Settings, Sidebar, Layout components
│   ├── hooks/              # useChat, useSpeechRecognition, useLiveVoice, etc.
│   ├── services/           # Typed API Client for backend endpoints
│   └── styles/             # Dark elegant aesthetic & typography
├── shared/                 # Isomorphic TypeScript types and API contracts
├── server.ts               # Universal entry point (Vite in dev, static in prod)
└── render.yaml             # Render infrastructure blueprint
```

---

## 🚀 Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment Variables
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
*(If no API keys are supplied, JEXA will automatically initialize in Development Mock Mode with full memory and persona routing enabled).*

### 3. Start Development Server
```bash
npm run dev
```
Open `http://localhost:3000` to interact with JEXA. The Express backend and Vite frontend run simultaneously on port 3000.

---

## 🧠 AI Brain & Provider Abstraction

JEXA's brain is strictly decoupled from the UI:

1. **Two Independent AI APIs**:
   - **Text AI Provider** (`ITextAIProvider`): Handles conversational reasoning, streaming chunks, and memory-aware dialogues. Configured via `TEXT_AI_API_KEY` and `TEXT_AI_PROVIDER`.
   - **Voice AI Provider** (`IVoiceAIProvider`): Dedicated speech synthesis and transcription pipeline, independent of text generation. Configured via `VOICE_AI_API_KEY` and `VOICE_AI_PROVIDER`.

2. **Modular Brain Subsystems**:
   - `ai/brain/identity.ts`: JEXA identity, values, and creator attribution (*Powered by JOHNEY TEC*).
   - `ai/brain/personality.ts`: 4 dynamic styles (*Empathetic Companion*, *Deep Thinker*, *Creative Muse*, *Executive Partner*).
   - `ai/brain/behavior.ts`: Directives for active listening, curiosity, and intellectual honesty.
   - `ai/brain/context-handler.ts`: Assembles identity, personality directives, user context, and retrieved memories into a clean system prompt.

3. **Memory Engine**:
   - `ai/memory/short-term.ts`: Sliding conversation context window.
   - `ai/memory/memory-retrieval.ts`: Keyword & category relevance scoring algorithm.
   - `ai/memory/long-term.ts`: Structured memory categories (*user_fact*, *preference*, *goal*, *milestone*).

---

## 🗄️ Supabase Database Setup

JEXA uses a database service layer (`backend/src/database/db-service.ts`) that shields the rest of the application from direct database dependencies.

### Step 1: Create a Supabase Project
1. Log in to [Supabase](https://supabase.com) and create a new project.
2. In the Supabase Dashboard, open the **SQL Editor**.
3. Copy the contents of `backend/src/database/schema.sql` and run it. This creates:
   - `users`
   - `conversations`
   - `messages`
   - `memories`
   - `user_preferences`
   - `ai_settings`
   along with performance indexes and Row Level Security policies.

### Step 2: Set Supabase Keys in `.env`
```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

*Note: If keys are omitted, JEXA seamlessly runs on an in-memory repository with seed data so you can test immediately.*

---

## ☁️ Deploying to Render

JEXA is fully structured for zero-friction deployment to [Render](https://render.com).

### Render Web Service Settings:
- **Environment**: `Node`
- **Build Command**:
  ```bash
  npm install && npm run build
  ```
- **Start Command**:
  ```bash
  npm run start
  ```
- **Environment Variables**:
  - `PORT`: Handled automatically by Render (`10000` or assigned port). `server.ts` binds dynamically to `process.env.PORT`.
  - `NODE_ENV`: `production`
  - `TEXT_AI_API_KEY`: Your model API key
  - `VOICE_AI_API_KEY`: Your voice API key
  - `SUPABASE_URL`: Your Supabase URL
  - `SUPABASE_SERVICE_ROLE_KEY`: Your Supabase service role key

---

## 📱 Mobile-First Features & UX

- **Voice-to-Text Input**: Integrated Web Speech API microphone button with automatic speech recognition, field insertion, and editable review before sending.
- **Full-Screen Live Voice Mode**: Dedicated AI frequency visualization interface with real-time listening/speaking states, mute controls, and conversational audio feedback.
- **ChatGPT-Style Sidebar**: Mobile slide-out drawer & desktop sidebar with conversation search, history list, brain personality switcher, and memory inspector.
- **Zero-Pill Anti-Slop Visual System**: Dark graphite slate palette, balanced typography (Plus Jakarta Sans + Syne), 60-30-10 color discipline, and fluid Framer Motion micro-interactions.

---

## 📄 License
Created and Engineered by **JOHNEY TEC**.
