# Panora - Manga Translation Extension

Read any manga, in any language, instantly.

## Quick Start

### Run Everything (Recommended)
```bash
npm run dev:all
```
This starts both the Convex auth server and the extension dev server simultaneously.

### Run Individually

**Extension only:**
```bash
npm run dev
# or
npm run dev:extension
```

**Auth server only:**
```bash
npm run dev:server
```

## Available Scripts

| Script | Description |
|--------|-------------|
| `npm run dev:all` | 🚀 Start both server and extension (recommended) |
| `npm run dev` | Start extension dev server only |
| `npm run dev:server` | Start Convex auth server only |
| `npm run dev:extension` | Start extension dev server only |
| `npm run build` | Build extension for production |
| `npm run build:server` | Deploy Convex server |
| `npm run build:all` | Build both extension and server |
| `npm run package` | Create extension distribution zip |
| `npm run fix-icons` | Fix icon assets |

## Loading the Extension

### Chrome
1. Open `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select `build/chrome-mv3-dev` directory

### Firefox
1. Open `about:debugging`
2. Click "Load Temporary Add-on"
3. Select manifest.json from `build/firefox-mv3-dev`

## Development Workflow

1. **Start development servers:**
   ```bash
   npm run dev:all
   ```

2. **Load extension in browser** (see above)

3. **Make changes** - Hot reload will update:
   - UI components: Instant
   - Background script: Requires extension reload
   - Content scripts: Requires page refresh

4. **For auth server changes**, Convex will auto-deploy on save

## Architecture

- **Extension**: `/src` - Plasmo + React + TypeScript
- **Auth Server**: `/server` - Convex + BetterAuth
- **Build Output**: `/build` - Chrome/Firefox builds

## Environment Setup

### Extension `.env.local`
```env
PLASMO_PUBLIC_GEMINI_API_KEY=your-key-here
PLASMO_PUBLIC_OPENAI_API_KEY=your-key-here
PLASMO_PUBLIC_DEFAULT_PROVIDER=gemini
PLASMO_PUBLIC_DEFAULT_TARGET_LANG=en
PLASMO_PUBLIC_AUTH_SERVER_URL=http://localhost:3000
```

### Server Environment
Set these during `npx convex dev`:
- `BETTER_AUTH_SECRET` - Generate with `openssl rand -base64 32`
- `GOOGLE_CLIENT_ID` - From Google Cloud Console (optional)
- `GOOGLE_CLIENT_SECRET` - From Google Cloud Console (optional)

## Features

- 🔍 Auto-detect manga panels across web pages
- 📝 OCR text extraction from speech bubbles
- 🌐 AI-powered translation (Gemini 2.5 Flash / GPT-4o Mini)
- 🎨 Overlay translations with manga styling
- 🔐 User authentication (Google OAuth / Email & Password)
- ⚡ Caching for faster re-translations

## Tech Stack

- **Framework**: Plasmo (Browser Extension Framework)
- **UI**: React 18 + TypeScript
- **Styling**: Tailwind CSS + CSS-in-JS
- **AI**: Google Gemini API / OpenAI API
- **Auth**: Convex + BetterAuth
- **Build**: TypeScript + Plasmo bundler

## Troubleshooting

### Extension context invalidated
Refresh the page where you're using the extension.

### Auth not working
Ensure the auth server is running: `npm run dev:server`

### Build errors
Run `npm install` in both root and `/server` directories.

### Hot reload not working
- For background script changes: Reload extension in browser
- For content script changes: Refresh the web page
- For popup changes: Reopen the popup

## License

MIT
