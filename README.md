# JEXA — AI Companion Web Application
> **Powered by JOHNEY TEC**

A production-ready, consumer AI companion web application architected with React, TypeScript, a modular AI Brain, independent Text & Voice provider abstractions, real-time audio-reactive LIVE voice mode, and Supabase persistent memory foundation.

Designed for automated deployment: **Frontend on GitHub Pages** (via GitHub Actions) and **Backend on Render**.

---

## 🌟 System Architecture

```
                  ┌─────────────────────────────────────────┐
                  │          GITHUB PAGES FRONTEND          │
                  │   - Minimal Consumer Chat & Sidebar     │
                  │   - Audio-Reactive 60 FPS Voice Orb     │
                  │   - Web Audio Analyser & Speech Input   │
                  │   - SPA Routing (404.html fallback)     │
                  └────────────────────┬────────────────────┘
                                       │
                                       │ HTTPS REST Requests
                                       │ (VITE_API_BASE_URL)
                                       ▼
                  ┌─────────────────────────────────────────┐
                  │             RENDER BACKEND              │
                  │   - Node.js + Express API (/api/*)      │
                  │   - Modular AI Brain & Identity         │
                  │   - Gemini AI Provider (@google/genai)  │
                  │   - Supabase Service Role Persistence   │
                  │   - Server Secrets securely held        │
                  └─────────────────────────────────────────┘
```

---

## 🚀 GitHub Pages Frontend Deployment (Automated)

The frontend is automated to build and deploy to **GitHub Pages** on every push via `.github/workflows/deploy.yml`.

### How It Works:
1. **Push to `main` or `master` branch** triggers `.github/workflows/deploy.yml`.
2. GitHub Actions sets up Node.js 20, installs dependencies, runs TypeScript validation (`npm run lint`), and compiles the production bundle (`npm run build`).
3. The workflow verifies that `dist/index.html`, `dist/404.html`, and `dist/assets` were successfully built.
4. Official GitHub Pages actions (`actions/upload-pages-artifact` & `actions/deploy-pages`) publish the bundle to your GitHub Pages URL:
   `https://<username>.github.io/<repository-name>/`

### Repository Setup for GitHub Pages:
1. Push this repository to GitHub.
2. Go to your repository on GitHub:
   - **Settings** → **Pages**
   - Under **Build and deployment** → **Source**, select **GitHub Actions**.
3. (Optional) In **Settings** → **Secrets and variables** → **Actions** → **Variables**:
   - Add variable: `VITE_API_BASE_URL`
   - Value: Your deployed Render backend URL (e.g., `https://jexa-backend.onrender.com`).
   - If left blank, the frontend runs in standalone local mode.

### Subpath & Relative Assets:
`vite.config.ts` is configured with `base: process.env.VITE_BASE_PATH || './'`, ensuring all scripts, styles, and images load correctly regardless of whether the site is hosted at the root domain (`https://username.github.io/`) or a repository subpath (`https://username.github.io/jexa/`).

### SPA Routing Fallback:
GitHub Pages serves `public/404.html` when a user navigates or refreshes directly on a subroute (e.g. `/projects`, `/schedule`, `/settings`). The included SPA restoration script decodes the route back into `window.history.replaceState` before React renders, avoiding 404 errors.

---

## ☁️ Render Backend Deployment

The backend runs as a secure Node.js service on [Render](https://render.com).

### Render Web Service Settings:
- **Build Command**: `npm install && npm run build`
- **Start Command**: `npm run start`
- **Environment Variables on Render**:
  - `NODE_ENV`: `production`
  - `PORT`: Handled automatically by Render (binds to `0.0.0.0`)
  - `GEMINI_API_KEY` or `AI_API_KEY`: Your Gemini API Key
  - `GROQ_API_KEY`: Your Groq API Key (optional fallback provider)
  - `TAVILY_API_KEY`: Your Tavily Search API Key for real-time live web search and clickable citations (free at https://tavily.com)
  - `SUPABASE_URL`: Your Supabase database URL (optional, defaults to in-memory store)
  - `SUPABASE_SERVICE_ROLE_KEY`: Your Supabase Service Role Key (server-side only)

> **Security Guarantee**: Private server secrets (`GEMINI_API_KEY`, `TAVILY_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`) are stored **exclusively** on Render and never exposed to the client or committed to GitHub.

---

## 🌐 Live Web Search & Dynamic AI Activity Status

JEXA features intelligent real-time web search powered by the **Tavily Search API** and real-time Server-Sent Events (SSE):

- **Intelligent Search Decisions**: Jexa decides whether to answer directly from baseline knowledge or fetch real-time web data for breaking news, current events, sports scores, live market rates, or documentation templates.
- **Dynamic AI Activity Status**: The frontend displays live, actual status operations in real time near the response area:
  - `Thinking...`
  - `Planning...`
  - `Searching the web...` (with live query chip)
  - `Reading web pages...`
  - `Analyzing sources...`
  - `Processing information...`
  - `Preparing answer...`
  - `Answer complete`
  - `Search failed — retry available` (with one-click retry)
- **Clickable Citations & Source Cards**: Answers include clickable markdown links and an interactive **Sources & Citations** panel with domain badges and snippets.
- **Graceful Setup Notices**: If `TAVILY_API_KEY` is not yet configured, Jexa provides a helpful setup guide without crashing.

---

## 💻 Local Development

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment Variables
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

### 3. Start Local Full-Stack Server
```bash
npm run dev
```
Open `http://localhost:3000` to interact with JEXA. The Express backend and Vite frontend run simultaneously on port 3000.

---

## 🎙️ LIVE Voice Experience

- **60 FPS Audio-Reactive Fluid Energy Orb**: Canvas-based visualization driven directly by real microphone audio via Web Audio `AudioContext` and `AnalyserNode`.
- **Instant Barge-In Interruption**: If the user speaks while JEXA is speaking, audio synthesis immediately stops and switches to listening mode.
- **Explicit Honest States**: `Connecting` → `Listening` ⇄ `Processing` ⇄ `Speaking` (or `Muted`, `Error`). No fake greetings or simulated responses.
- **Leak-Free Resource Cleanup**: Closing LIVE mode immediately releases all microphone media tracks, audio contexts, and speech recognition listeners.
- **State Preservation**: Returning from LIVE restores the exact active conversation with full history preserved.

---

## 📄 License
Created and Engineered by **JOHNEY TEC**.
