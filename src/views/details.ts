import { html, render } from "lit-html";
import packageJson from "../../package.json";
import type { SearchResult } from "../../typings/icon-index";
import "./details.css";

// Function to render icon details
export function renderDetails(icon: SearchResult, detailsContainer: HTMLElement) {
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
          ${icon.options.map(
            (option) => html`
              <div class="icon-option">
                <h2>${option.style}</h2>
                <div class="icon-preview">
                  <svg width="48" height="48">
                    <use href="${import.meta.env.BASE_URL}/${icon.filename}#${option.style}" />
                  </svg>
                </div>
                <div class="icon-info">
                  <code-snippet
                    .lang=${"html"}
                    .code=${`<vibe-icon name="${icon.filename.split(".svg")[0]}"${option.style !== "regular" ? ` ${option.style}` : ""}></vibe-icon>`}
                  ></code-snippet>
                  <menu>
                    <button>HTML</button>
                    <button>SVG</button>
                    <button>Download</button>
                  </menu>
                </div>
              </div>
            `
          )}
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
          <p>Use SVG symbols in HTML</p>
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
