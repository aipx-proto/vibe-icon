import { html, render } from "lit-html";
import type { SearchResult } from "../../typings/icon-index";

// Function to render icon details
export function renderDetails(icon: SearchResult, detailsContainer: HTMLElement) {
  render(
    html`
      <div class="icon-details">
        <h2>${icon.name}</h2>

        ${icon.metaphors.length > 0
          ? html`
              <div class="metaphors">
                <span>Metaphors: </span>
                <span>${icon.metaphors.join(", ")}</span>
              </div>
            `
          : null}
        ${icon.options.map(
          (option) => html`
            <div class="style-section">
              <div class="icon-preview">
                <svg width="96" height="96">
                  <use href="${import.meta.env.BASE_URL}/${icon.filename}#${option.style}" />
                </svg>
              </div>

              <div class="code-snippet">
                <h4>${option.style}</h4>
                <p>1. Add to index.html:</p>
                <code-snippet
                  .lang=${"html"}
                  .code=${`
<svg style="display: none;">
  <symbol id="${icon.filename.split(".svg")[0]}-${option.style}">
    <!-- Icon content from ${icon.filename}#${option.style} -->
  </symbol>
</svg>
                  `.trim()}
                ></code-snippet>
                <p>2. Use the icon:</p>
                <code-snippet
                  .lang=${"html"}
                  .code=${`
<svg width="24" height="24">
  <use href="#${icon.filename.split(".svg")[0]}-${option.style}" />
</svg>
                    `.trim()}
                ></code-snippet>
              </div>
            </div>
          `
        )}
      </div>
    `,
    detailsContainer
  );
}
