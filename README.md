<div align="center">
  <img src="ui/assets/icon.png" alt="Panora" width="72" />
  <h1>Panora</h1>
</div>

Panora is a Chrome extension that translates manga speech bubbles in real time. You're on a manga website, you click translate, and it overlays translated text directly on top of the bubbles — no leaving the page.

---

## Features

**Speech Bubble and Floating Text Detection**
A locally running RT-DETR-v2 model detects three classes of text regions: outer bubble shells (`bubble`), inner text areas (`text_bubble`), and free-floating text outside bubbles (`text_free` — SFX, narration boxes, titles). Bounding boxes are accurate even for irregular shapes.

**Pooled OCR and Translation**
All detected region crops across panels are pooled and sent to Gemini 2.5 Flash Lite in chunks of 6 for text extraction and translation. The primary model falls back to Gemini 2.5 Flash automatically when rate limits are hit.

**Overlay Rendering**
Translated text is rendered as positioned overlays directly on top of the manga image. The overlay system accounts for object-fit, partial bubbles at image edges, bubble type (speech, narration, tall, text_free), and font size estimation.

**Partial Bubble Handling**
Speech bubbles that are cut off at the top or bottom of an image are detected and handled with custom positioning logic that anchors the overlay to the correct visible edge.

**Per-Panel Translation**
On each translate click, the extension identifies the largest manga panel currently visible in the viewport and processes it. Previously translated panels retain their overlays as you scroll.

**Translation Caching**
Results are cached in `chrome.storage.local` with a one-hour TTL, so re-translating the same panel is instant.

**Multi-Language Support**
Supports translation into 12 languages: English, Japanese, Korean, Chinese, Spanish, French, German, Portuguese, Italian, Arabic, Thai, and Vietnamese.

---

## Tech Stack

- **Extension Framework**: Plasmo (React 18 + TypeScript, Chrome MV3)
- **Detection Model**: RT-DETR-v2 r50vd (`ogkalu/comic-text-and-bubble-detector`) — 3 classes: bubble, text_bubble, text_free
- **Detection Server**: Python 3 + FastAPI + HuggingFace Transformers + timm; single process with a 10-thread pool for concurrent inference (MPS-compatible on Apple Silicon)
- **Translation / OCR**: Google Gemini 2.5 Flash Lite (primary), Gemini 2.5 Flash (fallback)
- **Auth**: Better Auth + Convex (shared deployment — no setup needed for contributors)
- **Build**: Plasmo bundler

---

## Repository Structure

```
extension/
├── ui/            Chrome extension source (Plasmo + React + TypeScript)
│   └── auth/      Convex auth backend (TypeScript, maintainers only)
└── server/        Local RT-DETR-v2 detection server (Python + FastAPI)
```

---

## API Key Setup

Panora requires a Google Gemini API key to perform OCR and translation. The key is stored locally in the extension and never transmitted anywhere except to the Gemini API.

1. Get a free API key at [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey)
2. Open the extension and click the **☰** settings icon
3. Enter your key in the **Gemini API Key** field
4. Click **Save Settings**

The key is saved in `chrome.storage.local` and persists across sessions. No environment variables are needed for end users.

---

## Environment Variables

**Extension (`ui/`)**

| Variable | Description |
|---|---|
| `PLASMO_PUBLIC_AUTH_SERVER_URL` | URL of the Better Auth + Convex auth server. Pre-filled in `.env.example` with the shared deployment — no changes needed for contributors. |

`dev.sh` automatically copies `ui/.env.example` to `ui/.env.local` on first run.

**Server (`server/`)**

| Variable | Default | Description |
|---|---|---|
| `LOG_LEVEL` | `INFO` | Python log level. Set to `DEBUG` to enable per-detection-box logs. |
| `PANORA_DISABLE_MPS` | unset | Set to `1` to force CPU inference. |

**Auth backend (`ui/auth/`) — maintainers only**

| Variable | Description |
|---|---|
| `CONVEX_URL` | Convex deployment API URL. |
| `CONVEX_SITE_URL` | Convex site URL used by Better Auth for CORS and redirects. |

Copy `ui/auth/.env.example` to `ui/auth/.env.local` only if you are running your own Convex deployment. Contributors using the shared deployment do not need this file.

---

## Quickstart

### Prerequisites

- Node.js 18 or later
- Python 3.10 or later
- A Google Gemini API key ([get one here](https://aistudio.google.com/app/apikey))

---

### One-command setup

From the `extension/` directory:

```bash
./dev.sh
```

This will:
1. Create a Python virtual environment and install server dependencies (first run only)
2. Install Node.js dependencies for the extension (first run only)
3. Bootstrap `ui/.env.local` from `ui/.env.example` if it doesn't exist
4. Kill any existing process on port 5001 and start the RT-DETR-v2 detection server
5. Start the Plasmo extension dev build
6. Watch for Plasmo rebuilds and re-apply the correct extension icons automatically

Then load the extension in Chrome from `ui/build/chrome-mv3-dev`.

Press `Ctrl+C` to stop all services.

---

### Manual setup

**Server**

The local detection server runs an RT-DETR-v2 model that detects speech bubbles and floating text. Model weights are downloaded from HuggingFace on first run (~160 MB). It runs as a single process with a 10-thread pool for concurrent inference, and supports MPS on Apple Silicon.

```bash
cd server
python3 -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --host 127.0.0.1 --port 5001
```

Verify it is running:

```bash
curl http://localhost:5001/health
# {"status":"ok","model_loaded":true}
```

**UI (Chrome Extension)**

```bash
cd ui
npm install
cp .env.example .env.local
npm run dev
```

Load the extension in Chrome:

1. Open `chrome://extensions/`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select `ui/build/chrome-mv3-dev`

Once loaded, open the extension popup, go to **Settings**, and enter your Gemini API key.

The extension will hot-reload UI changes. Background script changes require an extension reload in `chrome://extensions/`.

---

## Contributing

Contributions are welcome. Please follow these guidelines.

**Branching**
- `main` — stable releases only
- `dev` — active development, open pull requests against this branch

**Workflow**
1. Fork the repository and create a feature branch from `dev`
2. Make your changes with clear, focused commits
3. Ensure the extension builds without errors (`npm run build` inside `ui/`)
4. If your change touches the server, verify the `/health` and `/detect-bubbles` endpoints still behave correctly
5. Open a pull request against `dev` with a description of what was changed and why

**Commit Style**
Use the conventional commits format:
- `feat:` for new features
- `fix:` for bug fixes
- `refactor:` for code changes that are not features or fixes
- `chore:` for tooling, dependencies, or configuration changes
- `perf:` for performance improvements
- `docs:` for documentation improvements

**Code Style**
- TypeScript strict mode is enabled — avoid `any` where possible
- No comments in code unless the logic is genuinely non-obvious
- Keep components and functions focused on a single responsibility

**Issues**
If you find a bug or want to propose a feature, open an issue before starting work so we can discuss the approach first.
