import { html, render } from "lit-html";
import { repeat } from "lit-html/directives/repeat.js";
import { combineLatestWith, distinctUntilChanged, from, Subject, switchMap, tap } from "rxjs";
import packageJson from "../../package.json";
import { displayNameToVibeIconSVGFilename } from "../../scripts/normalize-name";
import type { MetadataEntry, SearchResult } from "../../typings/icon-index";
import { renderTemplate } from "../render-template"; // Added import
import codingAgentPrompt from "./coding-agent-prompt.md?raw";
import { copyIconToClipboard } from "./copy-icon"; // Added import
import "./details.css";
import { preferredSize$ } from "./size";

const iconIdPrefix = "icon-";

async function optimizeSVG(input: string): Promise<string> {
  const { optimize } = await import("svgo/browser");
  return optimize(input).data;
}

const packageAsync: Promise<{ commit: string; time: number; version: string }> = fetch(
  `${import.meta.env.BASE_URL}/package.json?cacheBuster=${Date.now()}`, // Adding cache buster to avoid caching issues,
).then((response) => response.json());

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
    }, 2000);
  } catch (err) {
    console.error("Failed to copy HTML: ", err);
    // Consider adding a user notification for errors
  }
}

async function handleSvgCopy(svgUrl: string, button: HTMLButtonElement) {
  const originalText = button.textContent;
  try {
    const svgContent = await fetch(svgUrl)
      .then((response) => response.text())
      .then(optimizeSVG);
    await navigator.clipboard.writeText(svgContent);
    // Consider adding a user notification
    console.log("SVG copied to clipboard");
    button.textContent = "✅ Copied";
    setTimeout(() => {
      button.textContent = originalText;
    }, 2000);
  } catch (err) {
    console.error("Failed to copy SVG: ", err);
    // Consider adding a user notification for errors
  }
}

async function handlePreviewCopy(svgUrl: string, previewElement: HTMLElement) {
  const svgContent = await fetch(svgUrl)
    .then((response) => response.text())
    .then(optimizeSVG);
  await copyIconToClipboard(svgContent, previewElement);
}

async function handleDownload(svgUrl: string, fileName: string, button: HTMLButtonElement) {
  const originalText = button.textContent;
  try {
    const svgContent = await fetch(svgUrl)
      .then((response) => response.text())
      .then(optimizeSVG);
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
    }, 2000);
  } catch (err) {
    console.error("Failed to download SVG: ", err);
    // Consider adding a user notification for errors
  }
}

const detailsData$ = new Subject<{ icon: SearchResult; detailsContainer: HTMLElement }>();
const metadataRequestUrl$ = new Subject<string>();

const metadata$ = metadataRequestUrl$.pipe(
  distinctUntilChanged(),
  switchMap((url) =>
    from(
      fetch(url)
        .then((res) => res.json())
        .catch(() => ({ name: "", options: [] })), // Fallback in case of error
    ),
  ),
);

// fetch latest metadata
detailsData$
  .pipe(
    tap(({ icon }) =>
      metadataRequestUrl$.next(`${import.meta.env.BASE_URL}/${icon.filename.split(".svg")[0]}.metadata.json`),
    ),
  )
  .subscribe();

detailsData$
  .pipe(
    combineLatestWith(preferredSize$, metadata$),
    switchMap(([{ icon, detailsContainer }, size, metadata]) =>
      renderDetailsStream(metadata, icon, detailsContainer, size),
    ),
  )
  .subscribe();

export async function renderDetails(icon: SearchResult, detailsContainer: HTMLElement) {
  detailsData$.next({
    icon,
    detailsContainer,
  });
}

export function renderDetailsStream(
  metadata: MetadataEntry,
  icon: SearchResult,
  detailsContainer: HTMLElement,
  size: string,
) {
  const getRemoveSVGs = async () => {
    const uniqueSizes = icon.sizes;

    /* use subject value, but if not compatible, fallback to auto */
    const preferredSize = size === "auto" ? "auto" : uniqueSizes.includes(parseInt(size)) ? size : "auto";
    const preferredNumericSize = preferredSize === "auto" ? (icon.options.at(0)?.size ?? 24) : parseInt(preferredSize);
    const stylesForSize = metadata.options
      .filter((option) => option.size === preferredNumericSize)
      .map((option) => option.style);

    const remoteSVGs = await Promise.all(
      stylesForSize.map(async (style) => {
        const url = `${import.meta.env.BASE_URL}/${icon.filename.split(".svg")[0]}-${preferredNumericSize}-${style}.svg`;
        const svg = await fetch(url)
          .then((res) => res.text())
          .then(optimizeSVG)
          .catch(() => `<!-- Error fetching SVG for style ${style} -->`);

        return {
          name: icon.name,
          style,
          preferredSize,
          preferredNumericSize,
          parsedSVG: parseSourceSVG(icon.name, preferredNumericSize, svg),
        };
      }),
    );

    return remoteSVGs;
  };

  return from(getRemoveSVGs()).pipe(
    switchMap(async (remoteSVGs) => renderDetailsInternal(icon.sizes, remoteSVGs, icon, detailsContainer, size)),
  );
}

export async function renderDetailsInternal(
  sizes: number[],
  remoteSVGs: RemoteSVG[],
  icon: SearchResult,
  detailsContainer: HTMLElement,
  size: string,
) {
  const uniqueSizes = sizes;
  /* use subject value, but if not compatible, fallback to auto */
  const preferredSize = size === "auto" ? "auto" : uniqueSizes.includes(parseInt(size)) ? size : "auto";
  const preferredNumericSize = preferredSize === "auto" ? (icon.options.at(0)?.size ?? 24) : parseInt(preferredSize);

  const prioritizeRegularStyle = (a: { style: string }) => (a.style === "regular" ? -1 : 1);
  const sortedOptions = icon.options.toSorted(prioritizeRegularStyle);

  const packageInfo = await packageAsync;

  const advancedInstallIconOptionsStrings = remoteSVGs.toSorted(prioritizeRegularStyle).map((remoteIcon) => {
    return `  <symbol id="${iconIdPrefix}${displayNameToVibeIconSVGFilename(remoteIcon.name)}-${remoteIcon.preferredNumericSize}-${
      remoteIcon.style
    }" viewBox="${remoteIcon.parsedSVG.viewbox}">
${remoteIcon.parsedSVG.svgInnerHTML
  .split("\n")
  .map((line) => `    ${line}`)
  .join("\n")}
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
        <section>
          <div
            class="mri-control-group"
            @click=${(e: MouseEvent) => {
              const target = e.target as HTMLButtonElement;
              if (target.tagName === "BUTTON") {
                const newSize = target.dataset.value || "auto";
                preferredSize$.next(newSize);
              }
            }}
          >
            <button data-value="auto" class="${preferredSize === "auto" ? "mri-active" : ""}">
              Auto (${icon.options.at(0)?.size})
            </button>
            ${repeat(
              uniqueSizes,
              (i) => i,
              (sizeOptions) =>
                html`<button
                  data-value="${sizeOptions}"
                  class="${sizeOptions.toString() === preferredSize ? "mri-active" : ""}"
                >
                  ${sizeOptions}
                </button>`,
            )}
          </div>
        </section>

        <section class="icon-option-list">
          ${icon.options.map((option) => {
            const svgUrl = `${import.meta.env.BASE_URL}/${icon.filename.split(".svg")[0]}-${preferredNumericSize}-${option.style}.svg`;

            const htmlCode = `<vibe-icon name="${icon.filename.split(".svg")[0]}"${option.style !== "regular" ? ` ${option.style}` : ""}${
              preferredSize === "auto" ? "" : ` size="${preferredSize}"`
            }></vibe-icon>`;
            const downloadFileName = `${icon.filename.split(".svg")[0]}-${option.style}.svg`;
            return html`
              <div class="icon-option">
                <h2>${option.style}</h2>
                <button
                  class="icon-preview"
                  @click=${(e: Event) => handlePreviewCopy(svgUrl, e.currentTarget as HTMLElement)}
                  type="button"
                  title="Copy SVG code"
                  aria-label="Copy SVG code"
                >
                  <svg width="48" height="48">
                    <use href="${import.meta.env.BASE_URL}/${icon.filename}#${option.style}" />
                  </svg>
                </button>
                <div class="icon-info">
                  <code-snippet .lang=${"html"} .code=${htmlCode}></code-snippet>
                  <menu>
                    <button @click=${(e: Event) => handleHtmlCopy(htmlCode, e.target as HTMLButtonElement)}>
                      HTML
                    </button>
                    <button @click=${(e: Event) => handleSvgCopy(svgUrl, e.target as HTMLButtonElement)}>SVG</button>
                    <button
                      @click=${(e: Event) => handleDownload(svgUrl, downloadFileName, e.target as HTMLButtonElement)}
                    >
                      Download
                    </button>
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
            .code=${`<script src="https://esm.sh/${packageJson.name}" type="module"></script>`}
          ></code-snippet>
          <p>Add icon to HTML</p>
          <code-snippet
            .lang=${"html"}
            .code=${`   
              ${icon.options
                .map((option) =>
                  `
<!-- ${option.style} style -->
<vibe-icon name="${icon.filename.split(".svg")[0]}"${option.style !== "regular" ? ` ${option.style}` : ""}></vibe-icon>
                `.trim(),
                )
                .join("\n\n")}

<!-- custom sizes: ${uniqueSizes.join(", ")} -->
<vibe-icon name="${icon.filename.split(".svg")[0]}" size="${icon.options.at(0)?.size}"></vibe-icon>
            `.trim()}
          ></code-snippet>
          <details>
            <summary>Ask a coding agent 😎</summary>
            <div class="coding-agent-prompt">
              <code-snippet
                .lang=${"markdown"}
                .code=${renderTemplate(codingAgentPrompt, {
                  iconName: icon.filename.split(".svg")[0],
                  packageName: packageJson.name,
                  packageVersion: packageJson.version,
                  searchToolUrl: window.location.origin + import.meta.env.BASE_URL,
                  uniqueSizes: uniqueSizes.join(", "),
                  preferredNumericSize,
                })}
              ></code-snippet>
            </div>
          </details>
        </section>
        <section class="icon-doc-section">
          <h2>Advanced install</h2>
          <p>Add SVG symbols to index.html without dependencies.</p>
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
            .code=${sortedOptions
              .map(
                (option) => `<svg width="${preferredNumericSize}" height="${preferredNumericSize}">
  <use href="#${iconIdPrefix}${icon.filename.split(".svg")[0]}-${preferredNumericSize}-${option.style}" />
</svg>`,
              )
              .join("\n\n")}
          ></code-snippet>
        </section>
        <p>
          This is not a Microsoft official project. It is generated from the open source project
          <a href="https://github.com/microsoft/fluentui-system-icons" target="_blank">Fluent UI System Icons</a>. This
          site is built with the awesome
          <a href="https://github.com/aipx-proto/mirai-css/" target="_blank">Mirai CSS</a>, a library for teleporting
          the apps of the future to here and now. Source code and documentation available on
          <a href="https://github.com/aipx-proto/vibe-icon" target="_blank">GitHub</a>.
        </p>

        <div class="subtle-text">
          ${new Date(packageInfo.time).toLocaleDateString()} ·
          <a
            href="https://github.com/microsoft/fluentui-system-icons/releases/tag/${packageInfo.version}"
            target="_blank"
            >v${packageInfo.version}</a
          >
          ·
          <a href="https://github.com/microsoft/fluentui-system-icons/commit/${packageInfo.commit}" target="_blank"
            >${packageInfo.commit.slice(0, 7)}</a
          >
        </div>
      </div>
    `,
    detailsContainer,
  );
}
export interface RemoteSVG {
  name: string;
  style: string;
  preferredSize: string;
  preferredNumericSize: number;
  parsedSVG: ParsedSVG;
}

export interface ParsedSVG {
  doc: any;
  viewbox: string;
  displaySVG: string;
  svgInnerHTML: string;
}

function parseSourceSVG(iconName: string, preferredNumericSize: number, code: string) {
  const svgDom = new DOMParser().parseFromString(code, "text/html");
  // set path fill to currentColor
  svgDom.querySelectorAll("path").forEach((path) => {
    path.setAttribute("fill", "currentColor");
  });

  const viewbox =
    svgDom.querySelector("svg")?.getAttribute("viewBox") ?? `0 0 ${preferredNumericSize} ${preferredNumericSize}`;

  const displaySVG = `
<svg xmlns="http://www.w3.org/2000/svg" data-icon="${iconName}" width="${preferredNumericSize}" height="${preferredNumericSize}" viewBox="${viewbox}">
${svgDom.querySelector("svg")?.innerHTML || ""}
</svg>
`.trim();

  const svgInnerHTML = (svgDom.querySelector("svg")?.innerHTML || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n");

  return {
    doc: svgDom,
    viewbox,
    displaySVG,
    svgInnerHTML,
  };
}
