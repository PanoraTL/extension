# Next Steps

## Immediate Actions Required

### 1. Install Dependencies

Due to network restrictions encountered during setup, you'll need to install the npm packages yourself:

```bash
cd /path/to/extension
npm install
```

**Important packages to install:**
- `plasmo` - The framework
- `@google/generative-ai` - For Gemini 2.5 Flash
- `openai` - For GPT-4o Mini
- `tailwindcss`, `autoprefixer`, `postcss` - For styling
- `tailwindcss-animate`, `clsx`, `tailwind-merge` - For shadcn-ui
- All other dependencies listed in `package.json`

### 2. Configure API Keys

1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```

2. Edit `.env` and add your API keys:
   ```
   PLASMO_PUBLIC_GEMINI_API_KEY=your_actual_key_here
   PLASMO_PUBLIC_OPENAI_API_KEY=your_actual_key_here
   PLASMO_PUBLIC_DEFAULT_PROVIDER=gemini
   PLASMO_PUBLIC_DEFAULT_TARGET_LANG=en
   ```

3. Get API keys:
   - **Gemini**: https://makersuite.google.com/app/apikey
   - **OpenAI**: https://platform.openai.com/api-keys

### 3. Start Development

```bash
npm run dev
```

This will:
- Start the Plasmo development server
- Watch for file changes
- Build the extension in `build/chrome-mv3-dev/`

### 4. Load Extension in Browser

**Chrome/Edge:**
1. Navigate to `chrome://extensions/`
2. Enable "Developer mode" (top right)
3. Click "Load unpacked"
4. Select the `build/chrome-mv3-dev` folder

**Firefox:**
1. Navigate to `about:debugging#/runtime/this-firefox`
2. Click "Load Temporary Add-on"
3. Select `manifest.json` from `build/firefox-mv3-dev`

## Project Structure Overview

```
extension/
├── src/                    # All source code (--with-src enabled)
│   ├── api/               # API service layer
│   │   └── services/
│   │       ├── gemini.ts  # Gemini 2.5 Flash integration
│   │       ├── openai.ts  # GPT-4o Mini integration
│   │       └── index.ts
│   ├── popup.tsx          # Extension popup UI
│   ├── background.ts      # Background service worker
│   ├── contents/          # Content scripts
│   │   ├── components/    # Content script UI components
│   │   ├── services/      # Content script services
│   │   └── translator.tsx # Main content script
│   ├── components/ui/     # shadcn-ui components (add as needed)
│   ├── lib/utils.ts       # Utility functions
│   ├── types/             # TypeScript type definitions
│   │   └── translator.types.ts
│   └── style.css          # Global Tailwind styles
│
├── assets/                # Static assets (icons, images)
├── package.json           # Dependencies & scripts
├── tsconfig.json          # TypeScript config (with src/ paths)
├── tailwind.config.js     # Tailwind CSS config
├── postcss.config.js      # PostCSS config
└── components.json        # shadcn-ui config
```

## Adding shadcn-ui Components

As you build the UI, add components from shadcn-ui:

```bash
# Examples:
npx shadcn-ui@latest add button
npx shadcn-ui@latest add card
npx shadcn-ui@latest add dialog
npx shadcn-ui@latest add select
npx shadcn-ui@latest add switch
npx shadcn-ui@latest add toast
```

Components will be added to `src/components/ui/`

## Development Tips

### 1. Import Aliases

The `~` alias points to `src/`:

```typescript
import { cn } from "~/lib/utils"
import Button from "~/components/ui/button"
```

### 2. Using API Services

```typescript
import { geminiService, openaiService } from "~/api/services"

// In your component or background script:
geminiService.initialize(process.env.PLASMO_PUBLIC_GEMINI_API_KEY)

const result = await geminiService.translateText("こんにちは", "en")
```

### 3. Content Script Development

The content script (`src/contents/manga-translator.tsx`) runs on all pages. You can:
- Listen for image clicks
- Extract text using OCR
- Show translation overlays
- Communicate with the background script

### 4. Hot Reload

Plasmo supports hot reload during development:
- Changes to UI components reload instantly
- Background script changes require extension reload
- Content script changes require page refresh

## Features to Implement

### Phase 1 - Core Functionality
- [ ] Image selection UI
- [ ] OCR text extraction
- [ ] Basic translation overlay
- [ ] API provider selection (Gemini/OpenAI)

### Phase 2 - Enhanced UX
- [ ] Translation caching
- [ ] Language auto-detection
- [ ] Multiple translation providers
- [ ] Settings persistence
- [ ] Keyboard shortcuts

### Phase 3 - Advanced Features
- [ ] Batch translation
- [ ] Translation history
- [ ] Custom translation rules
- [ ] Export translations
- [ ] Theme customization

## Useful Commands

```bash
# Development
npm run dev              # Start dev server with hot reload

# Production Build
npm run build           # Build for production

# Package for Distribution
npm run package         # Create zip for Chrome Web Store/Firefox Add-ons

# Code Quality
npm run format          # Format code with Prettier
```

## Resources

- **Plasmo Docs**: https://docs.plasmo.com/
- **Plasmo Examples**: https://github.com/PlasmoHQ/examples/tree/main/with-src
- **shadcn-ui**: https://ui.shadcn.com/
- **Tailwind CSS**: https://tailwindcss.com/docs
- **Gemini API**: https://ai.google.dev/docs
- **OpenAI API**: https://platform.openai.com/docs

## Common Issues

### "Module not found" errors
- Run `npm install` to install dependencies
- Check `tsconfig.json` paths configuration
- Verify file paths use `~/` alias correctly

### Extension not loading
- Run `npm run build` or `npm run dev` first
- Check browser console for errors
- Verify manifest.json exists in build folder

### API errors
- Verify `.env` file exists with correct keys
- Check API key permissions and quotas
- Ensure API keys are properly prefixed with `PLASMO_PUBLIC_`

## Support

For Plasmo-specific issues:
- Discord: https://www.plasmo.com/discord
- GitHub: https://github.com/PlasmoHQ/plasmo/issues

Good luck with your manga translator extension! 🎌📚
