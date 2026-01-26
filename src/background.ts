export {}

console.log("Background service worker loaded")

chrome.runtime.onInstalled.addListener(() => {
  console.log("Manga Translator extension installed")
})

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log("Message received in background:", request)

  if (request.action === "translate") {
    handleTranslation(request.text, request.targetLang)
      .then(result => sendResponse({ success: true, translation: result }))
      .catch(error => sendResponse({ success: false, error: error.message }))
    return true
  }
})

async function handleTranslation(text: string, targetLang: string = "en"): Promise<string> {
  return `Translated: ${text}`
}
