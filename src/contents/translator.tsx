import type { PlasmoCSConfig } from "plasmo"
import { useState, useEffect } from "react"
import "~/style.css"

export const config: PlasmoCSConfig = {
  matches: ["<all_urls>"],
  all_frames: true
}

const MangaTranslator = () => {
  const [isActive, setIsActive] = useState(false)

  useEffect(() => {
    if (isActive) {
      console.log("Manga translator activated")
      // Add event listeners for image selection
      document.addEventListener("click", handleImageClick)
    }

    return () => {
      document.removeEventListener("click", handleImageClick)
    }
  }, [isActive])

  const handleImageClick = (e: MouseEvent) => {
    const target = e.target as HTMLElement
    if (target.tagName === "IMG") {
      e.preventDefault()
      console.log("Image clicked:", target)
      // OCR and translation logic will be added here
    }
  }

  return null // This is an invisible content script
}

export default MangaTranslator
