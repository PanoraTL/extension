export function getImageContentRect(img: HTMLImageElement): {
  left: number;
  top: number;
  width: number;
  height: number;
} {
  const elRect = img.getBoundingClientRect();
  const elW = elRect.width;
  const elH = elRect.height;
  const natW = img.naturalWidth || elW;
  const natH = img.naturalHeight || elH;
  const objectFit = window.getComputedStyle(img).objectFit;

  if (objectFit === "contain") {
    const scale = Math.min(elW / natW, elH / natH);
    const contentW = natW * scale;
    const contentH = natH * scale;
    return {
      left: elRect.left + (elW - contentW) / 2,
      top: elRect.top + (elH - contentH) / 2,
      width: contentW,
      height: contentH,
    };
  }

  if (objectFit === "cover") {
    const scale = Math.max(elW / natW, elH / natH);
    const contentW = natW * scale;
    const contentH = natH * scale;
    return {
      left: elRect.left + (elW - contentW) / 2,
      top: elRect.top + (elH - contentH) / 2,
      width: contentW,
      height: contentH,
    };
  }

  return { left: elRect.left, top: elRect.top, width: elW, height: elH };
}

export function positionContainerOverImage(
  container: HTMLElement,
  img: HTMLImageElement,
) {
  const content = getImageContentRect(img);
  const parentRect = (
    container.parentElement as HTMLElement
  ).getBoundingClientRect();
  container.style.left = `${content.left - parentRect.left}px`;
  container.style.top = `${content.top - parentRect.top}px`;
  container.style.width = `${content.width}px`;
  container.style.height = `${content.height}px`;
}
