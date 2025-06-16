import "./copy-icon.css";

export async function copyIconToClipboard(
  svgContent: string,
  targetElement: HTMLElement,
  successMessage: string = "✅ Copied",
  errorMessage: string = "❌ Error"
) {
  // Remove any existing overlay first
  const existingOverlay = targetElement.querySelector(".copy-overlay");
  if (existingOverlay) {
    existingOverlay.remove();
  }

  try {
    await navigator.clipboard.writeText(svgContent);
    console.log("SVG copied to clipboard");

    const overlay = document.createElement("div");
    overlay.className = "copy-overlay";
    overlay.textContent = successMessage;
    targetElement.appendChild(overlay);

    setTimeout(() => {
      if (overlay.parentNode === targetElement) {
        targetElement.removeChild(overlay);
      }
    }, 2000);
  } catch (err) {
    console.error("Failed to copy SVG: ", err);

    const overlay = document.createElement("div");
    overlay.className = "copy-overlay icon-copy-error"; // Ensure error styling is applied
    overlay.textContent = errorMessage;
    targetElement.appendChild(overlay);

    setTimeout(() => {
      if (overlay.parentNode === targetElement) {
        targetElement.removeChild(overlay);
      }
    }, 2000);
  }
}
