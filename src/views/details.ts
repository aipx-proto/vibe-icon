import { html, render } from "lit-html";
import packageJson from "../../package.json";
import type { SearchResult } from "../../typings/icon-index";
import "./details.css";

const iconIdPrefix = "icon-";

// Helper functions for copy and download
async function handleHtmlCopy(htmlCode: string, button: HTMLButtonElement) {
  const originalText = button.textContent;
  try {
    await navigator.clipboard.writeText(htmlCode);
    // Consider adding a user notification (e.g., a toast message)
    console.log("HTML copied to clipboard");
    button.textContent = "✅ Copied";
    setTimeout(() => {
      button.textContent = originalText;
    }, 3000);
  } catch (err) {
    console.error("Failed to copy HTML: ", err);
    // Consider adding a user notification for errors
  }
}

async function handleSvgCopy(svgContent: string, button: HTMLButtonElement) {
  const originalText = button.textContent;
  try {
    await navigator.clipboard.writeText(svgContent);
    // Consider adding a user notification
    console.log("SVG copied to clipboard");
    button.textContent = "✅ Copied";
    setTimeout(() => {
      button.textContent = originalText;
    }, 3000);
  } catch (err) {
    console.error("Failed to copy SVG: ", err);
    // Consider adding a user notification for errors
  }
}

function handleDownload(svgContent: string, fileName: string, button: HTMLButtonElement) {
  const originalText = button.textContent;
  try {
    const blob = new Blob([svgContent], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a); // Appending to body is required for Firefox
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    console.log("SVG downloaded:", fileName);
    button.textContent = "✅ Downloaded";
    setTimeout(() => {
      button.textContent = originalText;
    }, 3000);
  } catch (err) {
    console.error("Failed to download SVG: ", err);
    // Consider adding a user notification for errors
  }
}

// Function to render icon details
export async function renderDetails(icon: SearchResult, detailsContainer: HTMLElement) {
  const response = await fetch(`${import.meta.env.BASE_URL}/${icon.filename}`);
  const svgText = await response.text();
  const svgDoc = new DOMParser().parseFromString(svgText, "image/svg+xml");

  const advancedInstallIconOptionsStrings = icon.options.map((option) => {
    const symbol = svgDoc.querySelector(`symbol#${option.style}`);
    const iconContent = symbol?.innerHTML.trim() || "<!-- Icon content not found -->";
    return `  <symbol id="${iconIdPrefix}${icon.filename.split(".svg")[0]}-${option.style}">
    ${iconContent}
  </symbol>`;
  });

  render(
    html`
      <div class="icon-details">
        <header>
          <h1>${icon.name}</h1>
          ${icon.metaphors.length > 0
            ? html`
                <div class="metaphors">
                  <span>Metaphors: </span>
                  <span>${icon.metaphors.join(", ")}</span>
                </div>
              `
            : null}
        </header>
        <section class="icon-option-list">
          ${icon.options.map((option) => {
            const symbolElement = svgDoc.querySelector(`symbol#${option.style}`);
            const rawSymbolContent = symbolElement?.innerHTML.trim() || "<!-- Icon content not found -->";
            const viewBox = symbolElement?.getAttribute("viewBox") || svgDoc.documentElement.getAttribute("viewBox") || "0 0 24 24";

            const fullSvgContent = `<svg width="24" height="24" viewBox="${viewBox}" xmlns="http://www.w3.org/2000/svg">${rawSymbolContent}</svg>`;
            const htmlCode = `<vibe-icon name="${icon.filename.split(".svg")[0]}"${option.style !== "regular" ? ` ${option.style}` : ""}></vibe-icon>`;
            const downloadFileName = `${icon.filename.split(".svg")[0]}-${option.style}.svg`;

            return html`
              <div class="icon-option">
                <h2>${option.style}</h2>
                <div class="icon-preview">
                  <svg width="48" height="48">
                    <use href="${import.meta.env.BASE_URL}/${icon.filename}#${option.style}" />
                  </svg>
                </div>
                <div class="icon-info">
                  <code-snippet .lang=${"html"} .code=${htmlCode}></code-snippet>
                  <menu>
                    <button @click=${(e: Event) => handleHtmlCopy(htmlCode, e.target as HTMLButtonElement)}>HTML</button>
                    <button @click=${(e: Event) => handleSvgCopy(fullSvgContent, e.target as HTMLButtonElement)}>SVG</button>
                    <button @click=${(e: Event) => handleDownload(fullSvgContent, downloadFileName, e.target as HTMLButtonElement)}>Download</button>
                  </menu>
                </div>
              </div>
            `;
          })}
        </section>
        <section class="icon-doc-section">
          <h2>Install</h2>
          <p>Add library script to index.html</p>
          <code-snippet
            .lang=${"html"}
            .code=${`<script src="https://esm.sh/${packageJson.name}@${packageJson.version}" type="module"></script>`}
          ></code-snippet>
          <p>Add icon to HTML</p>
          <code-snippet
            .lang=${"html"}
            .code=${icon.options
              .map((option) => `<vibe-icon name="${icon.filename.split(".svg")[0]}"${option.style !== "regular" ? ` ${option.style}` : ""}></vibe-icon>`)
              .join("\n")}
          ></code-snippet>
        </section>
        <section class="icon-doc-section">
          <h2>Advanced install</h2>
          <p>Add SVG symbols to index.html</p>
          <code-snippet
            .lang=${"html"}
            .code=${`
<svg style="display: none;">

  <!-- Code for existing icons -->

${advancedInstallIconOptionsStrings.join("\n\n")}
</svg>
            `.trim()}
          ></code-snippet>
          <p>Use SVG symbols in HTML</p>
          <code-snippet
            .lang=${"html"}
            .code=${icon.options
              .map(
                (option) => `<svg width="24" height="24">
  <use href="#${iconIdPrefix}${icon.filename.split(".svg")[0]}-${option.style}" />
</svg>`
              )
              .join("\n\n")}
          ></code-snippet>
        </section>
      </div>
    `,
    detailsContainer
  );
}
