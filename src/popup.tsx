import { useState } from "react"
import "~/style.css"

function IndexPopup() {
  const [translating, setTranslating] = useState(false)

  return (
    <div className="w-[400px] h-[600px] p-6 bg-background">
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-foreground">
            Manga Translator
          </h1>
        </div>

        <div className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            Select manga text on the page to translate it instantly.
          </p>

          <button
            onClick={() => setTranslating(!translating)}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
          >
            {translating ? "Stop Translation" : "Start Translation"}
          </button>

          <div className="mt-4 p-4 border border-border rounded-md">
            <h3 className="text-sm font-semibold mb-2">Settings</h3>
            <div className="flex flex-col gap-2">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" className="rounded" />
                <span>Auto-detect language</span>
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" className="rounded" />
                <span>Show original text</span>
              </label>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default IndexPopup
