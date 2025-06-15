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
              <h3>${option.style}</h3>
              <div class="icon-preview">
                <svg width="96" height="96">
                  <use href="${import.meta.env.BASE_URL}/${icon.filename}#${option.style}" />
                </svg>
              </div>
            </div>
          `
        )}
        <section class="code-snippet">
          <h3>Advanced</h3>
          <p>1. Add to index.html:</p>
          <code-snippet
            .lang=${"html"}
            .code=${`
<svg style="display: none;">

  <!-- Other icons code -->

${icon.options
  .map(
    (option) => `  <symbol id="${icon.filename.split(".svg")[0]}-${option.style}">
    <!-- Icon content -->
  </symbol>`
  )
  .join("\n\n")}
</svg>
            `.trim()}
          ></code-snippet>
          <p>2. Use the icon:</p>
          <code-snippet
            .lang=${"html"}
            .code=${icon.options
              .map(
                (option) => `<svg width="24" height="24">
  <use href="#${icon.filename.split(".svg")[0]}-${option.style}" />
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
