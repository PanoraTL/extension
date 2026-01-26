# Manga Translator Extension

A browser extension built with Plasmo Framework that translates manga text using OCR and AI-powered translation APIs (Gemini 2.5 Flash & GPT-4o Mini).

## Features

- 🖼️ OCR text extraction from manga images
- 🌐 AI-powered translation using Gemini 2.5 Flash or GPT-4o Mini
- 🎨 Clean UI built with Tailwind CSS and shadcn-ui
- ⚡ Fast and efficient translation
- 🎯 Works on any website with manga/comic images

## Tech Stack

- **Framework**: [Plasmo](https://www.plasmo.com/) - Browser Extension Framework
- **UI**: React + TypeScript
- **Styling**: Tailwind CSS + shadcn-ui
- **AI APIs**:
  - Google Gemini 2.5 Flash
  - OpenAI GPT-4o Mini

## Project Structure

```
.
├── src/                      # Source code directory
│   ├── api/                 # API services
│   │   └── services/
│   │       ├── gemini.ts    # Gemini API integration
│   │       ├── openai.ts    # OpenAI API integration
│   │       └── index.ts     # Service exports
│   ├── components/          # React components
│   │   └── ui/              # shadcn-ui components
│   ├── contents/            # Content scripts
│   │   ├── components/      # Content script UI components
│   │   ├── services/        # Content script services
│   │   └── translator.tsx   # Main content script
│   ├── lib/                 # Utility functions
│   │   └── utils.ts
│   ├── types/               # TypeScript type definitions
│   │   └── translator.types.ts
│   ├── popup.tsx            # Extension popup
│   ├── background.ts        # Background service worker
│   └── style.css            # Global styles
├── assets/                  # Static assets
├── package.json
├── tsconfig.json
├── tailwind.config.js
└── components.json          # shadcn-ui configuration
```

## Setup Instructions

### Prerequisites

- Node.js (v18 or higher)
- npm or pnpm
- API keys for Gemini and/or OpenAI

### Installation

1. **Install dependencies**:

   Due to network restrictions, you'll need to install dependencies manually:

   ```bash
   npm install
   ```

   If npm registry is blocked, you may need to:
   - Use a VPN or proxy
   - Configure npm to use a mirror registry
   - Or manually download and install packages

2. **Configure API Keys**:

   Create a `.env` file from the example:

   ```bash
   cp .env.example .env
   ```

   Edit `.env` and add your API keys:

   ```
   PLASMO_PUBLIC_GEMINI_API_KEY=your_gemini_api_key_here
   PLASMO_PUBLIC_OPENAI_API_KEY=your_openai_api_key_here
   PLASMO_PUBLIC_DEFAULT_PROVIDER=gemini
   PLASMO_PUBLIC_DEFAULT_TARGET_LANG=en
   ```

   Get your API keys:
   - **Gemini**: [Google AI Studio](https://makersuite.google.com/app/apikey)
   - **OpenAI**: [OpenAI Platform](https://platform.openai.com/api-keys)

3. **Development**:

   ```bash
   npm run dev
   ```

   This will start the Plasmo dev server and watch for changes.

4. **Build for Production**:

   ```bash
   npm run build
   ```

   The production build will be in the `build/` directory.

5. **Load Extension in Browser**:

   **Chrome/Edge:**
   - Go to `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select the `build/chrome-mv3-dev` (dev) or `build/chrome-mv3-prod` (production) folder

   **Firefox:**
   - Go to `about:debugging#/runtime/this-firefox`
   - Click "Load Temporary Add-on"
   - Select the `manifest.json` from `build/firefox-mv3-dev` or `build/firefox-mv3-prod`

## Usage

1. Click the extension icon to open the popup
2. Navigate to a manga/comic website
3. Click "Start Translation" in the popup
4. Click on manga images to extract and translate text
5. View the translated text overlay

## Adding shadcn-ui Components

To add new shadcn-ui components:

```bash
npx shadcn-ui@latest add button
npx shadcn-ui@latest add card
npx shadcn-ui@latest add dialog
# etc...
```

Components will be added to `src/components/ui/`

## Development Notes

### Using the `src` Directory

This project uses Plasmo's `--with-src` configuration, meaning all source code lives in the `src/` directory. The `~*` alias in imports points to `src/*`.

Example:
```typescript
import { cn } from "~/lib/utils"
import Button from "~/components/ui/button"
```

### API Services

The API services are in the `src/api/` directory and can be imported:

```typescript
import { geminiService, openaiService } from "~/api/services"

// Initialize with API key
geminiService.initialize(apiKey)

// Translate text
const translation = await geminiService.translateText("こんにちは", "en")

// Extract and translate from image
const result = await geminiService.extractAndTranslateFromImage(imageData, "en")
```

## Troubleshooting

### npm Registry Access Blocked

If you see 403 errors when installing packages:
1. Check your network/firewall settings
2. Try using a VPN
3. Configure npm to use a mirror:
   ```bash
   npm config set registry https://registry.npmmirror.com
   ```

### Extension Not Loading

1. Make sure you've built the project first (`npm run dev` or `npm run build`)
2. Check the browser console for errors
3. Verify the manifest.json is present in the build directory

### API Errors

1. Verify your API keys are correct in `.env`
2. Check API usage limits and quotas
3. Ensure the API keys have proper permissions

## Contributing

This project follows the Plasmo framework conventions. For more information:
- [Plasmo Documentation](https://docs.plasmo.com/)
- [Plasmo Examples](https://github.com/PlasmoHQ/examples)

## License

MIT
