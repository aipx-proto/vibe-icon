import { html, render } from "lit-html";
import packageJson from "../../package.json";
import type { SearchResult } from "../../typings/icon-index";
import "./details.css";

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
        <div class="icon-option-list">
          ${icon.options.map(
            (option) => html`
              <div class="icon-option">
                <h3>${option.style}</h3>
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
        </div>
        <section>
          <h3>Install</h3>
          <p>1. Add library script to HTML</p>
          <code-snippet
            .lang=${"html"}
            .code=${`<script src="https://esm.sh/${packageJson.name}@${packageJson.version}" type="module"></script>`}
          ></code-snippet>
          <p>2. Add icon to HTML</p>
          <code-snippet
            .lang=${"html"}
            .code=${icon.options
              .map((option) => `<vibe-icon name="${icon.filename.split(".svg")[0]}"${option.style !== "regular" ? ` ${option.style}` : ""}></vibe-icon>`)
              .join("\n")}
          ></code-snippet>
        </section>
        <section>
          <h3>Advanced install</h3>
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
