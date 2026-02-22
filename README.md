<div align="center">
  <img src="ui/assets/icon.png" alt="Panora" width="72" />
  <h1>Panora</h1>
</div>

Panora is a Chrome extension that translates manga speech bubbles in real time directly in your browser. It detects speech bubbles on any manga reading website, runs OCR on each bubble, and overlays the translated text with minimal visual disruption to the original artwork.

---

## Features

**Speech Bubble Detection**
A locally running YOLOv8 segmentation model detects speech bubbles with high spatial accuracy, returning precise bounding boxes for each bubble in the panel.

**Per-Bubble OCR and Translation**
Each detected bubble crop is sent to Gemini 2.5 Flash for text extraction and translation. The primary model falls back to Gemini 2.5 Flash Lite automatically when rate limits are hit.

**Gemini Fallback Detection**
If the local YOLO server is unavailable, the extension falls back to Gemini-based full-image detection and translation, ensuring the extension works without any local server running.

**Overlay Rendering**
Translated text is rendered as positioned overlays directly on top of the manga image. The overlay system accounts for object-fit, partial bubbles at image edges, bubble type (speech, narration, tall), and font size estimation.

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
- **Detection Model**: YOLOv8 segmentation (`kitsumed/yolov8m_seg-speech-bubble`)
- **Detection Server**: Python 3 + FastAPI + Ultralytics
- **Translation / OCR**: Google Gemini 2.5 Flash (primary), Gemini 2.5 Flash Lite (fallback)
- **Auth**: Better Auth + Convex
- **Build**: Plasmo bundler

---

## Repository Structure

```
extension/
├── ui/            Chrome extension source (Plasmo + React + TypeScript)
│   └── auth/      Convex auth backend (TypeScript)
└── server/        Local YOLO detection server (Python + FastAPI)
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

Only one environment variable is needed, for the auth backend:

| Variable | Description |
|---|---|
| `PLASMO_PUBLIC_AUTH_SERVER_URL` | URL of the Better Auth + Convex auth server. Defaults to `http://localhost:3000`. |

Copy `ui/.env.example` to `ui/.env.local` and set this if running your own auth server.

---

## Quickstart

### Prerequisites

- Node.js 18 or later
- Python 3.10 or later
- A Google Gemini API key ([get one here](https://aistudio.google.com/app/apikey))

---

### One-command setup

From the `extension/` directory, a single script starts all services — the YOLO detection server, the Convex backend, and the Plasmo extension:

```bash
./dev.sh
```

This will:
1. Create a Python virtual environment and install dependencies (first run only)
2. Start the YOLO server on `http://127.0.0.1:5001`
3. Start the Plasmo extension dev build and Convex backend
4. Watch for Plasmo rebuilds and re-apply the correct extension icons automatically

Then load the extension in Chrome from `ui/build/chrome-mv3-dev`.

Press `Ctrl+C` to stop all services.

---

### Manual setup

---

### Server

The local detection server runs a YOLOv8 model that detects speech bubble locations. It downloads the model weights on first run (~52 MB).

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

---

### UI (Chrome Extension)

```bash
cd ui
npm install
cp .env.example .env.local
```

Start the development build:

```bash
npm run dev:all
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
