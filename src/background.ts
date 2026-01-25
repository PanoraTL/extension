export {}

console.log("Background service worker loaded")

// Listen for extension installation
chrome.runtime.onInstalled.addListener(() => {
  console.log("Manga Translator extension installed")
})

// Listen for messages from content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log("Message received in background:", request)

  if (request.action === "translate") {
    // Handle translation request
    handleTranslation(request.text, request.targetLang)
      .then(result => sendResponse({ success: true, translation: result }))
      .catch(error => sendResponse({ success: false, error: error.message }))
    return true // Keep the message channel open for async response
  }
})

async function handleTranslation(text: string, targetLang: string = "en"): Promise<string> {
  // Translation logic will be implemented here
  // This will use the Gemini or GPT API
  return `Translated: ${text}`
}
