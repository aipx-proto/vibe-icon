export function generateSvgFromSymbol(
  svgDoc: Document, // The parsed SVG document object
  style: string, // The ID of the symbol (e.g., "regular", "filled")
  width: number = 24, // Desired width of the output SVG
  height: number = 24, // Desired height of the output SVG
  defaultViewBox: string = "0 0 24 24", // Fallback viewBox if not found on symbol or root SVG
): string | null {
  const symbolElement = svgDoc.querySelector(`symbol#${style}`);

  if (!symbolElement) {
    console.warn(`Symbol for style '${style}' not found in the provided SVG document.`);
    return null;
  }

  const rawSymbolContent = symbolElement.innerHTML.trim();

  // Prioritize viewBox from symbol, then from root <svg> element, then default
  const rootSvgElement = svgDoc.documentElement;
  const docViewBox = rootSvgElement ? rootSvgElement.getAttribute("viewBox") : null;
  const viewBox = symbolElement.getAttribute("viewBox") || docViewBox || defaultViewBox;

  return `<svg width="${width}" height="${height}" viewBox="${viewBox}" xmlns="http://www.w3.org/2000/svg">${rawSymbolContent}</svg>`;
}
