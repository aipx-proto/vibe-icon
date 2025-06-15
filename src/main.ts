import { html, render } from "lit-html";
import { repeat } from "lit-html/directives/repeat.js";
import { unsafeHTML } from "lit-html/directives/unsafe-html.js";
import { debounceTime, fromEvent, switchMap, tap } from "rxjs";
import type { SearchResult } from "../typings/icon-index";
import "./style.css";
import SearchWorker from "./worker?worker";

const worker = new SearchWorker();
const resultsContainer = document.querySelector("#results") as HTMLElement;
const detailsContainer = document.querySelector("#details") as HTMLElement;

// Track loaded icons to avoid re-observing
const loadedIcons = new WeakSet<Element>();

// State for pagination
let currentResults: SearchResult[] = [];
const DISPLAY_INITIAL_LIMIT = 50; // Initial number of icons to display
const DISPLAY_INCREMENT = 50;
let currentDisplayLimit = DISPLAY_INITIAL_LIMIT;

// Set up Intersection Observer
const iconObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        const iconElement = entry.target as HTMLElement;
        const svgContainer = iconElement.querySelector(".svg-container") as HTMLElement;
        const filename = iconElement.dataset.filename;
        const styles = iconElement.dataset.style?.split(",") || [];

        if (filename && styles.length > 0 && svgContainer && !svgContainer.dataset.loaded) {
          svgContainer.innerHTML = styles
            .slice(0, 1)
            .map((style) => {
              return `<svg width="48" height="48">
              <use href="${import.meta.env.BASE_URL}/${filename}#${style}" />
            </svg>`;
            })
            .join("");

          svgContainer.dataset.loaded = "true";
          iconObserver.unobserve(iconElement);
          loadedIcons.add(iconElement);
        }
      }
    });
  },
  {
    rootMargin: "50px", // Start loading 50px before entering viewport
    threshold: 0.01,
  }
);

// Function to render icon details
function renderDetails(icon: SearchResult) {
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
                <pre><code>&lt;svg width="24" height="24"&gt;
  &lt;use href="${location.origin}${import.meta.env.BASE_URL}/${icon.filename}#${option.style}" /&gt;
&lt;/svg&gt;</code></pre>
              </div>
            </div>
          `
        )}
      </div>
    `,
    detailsContainer
  );
}

// Function to render results with show more button
function renderResults(results: SearchResult[], limit: number) {
  const visibleResults = results.slice(0, limit);
  const hasMore = results.length > limit;

  render(
    html`
      <div class="icon-grid">
        ${repeat(
          visibleResults,
          (icon) => icon.name,
          (icon) => html`
            <button
              class="icon"
              data-filename="${icon.filename}"
              data-style="${icon.options.map((opt) => opt.style).join(",")}"
              @click=${() => renderDetails(icon)}
            >
              <div class="svg-container" style="height: 48px; display: flex; gap: 8px">
                <!-- SVG will be loaded when visible -->
              </div>
              <div class="icon-name" title="${icon.name}">${unsafeHTML(icon.nameHtml)}</div>
              <div hidden>
                <div><span>${icon.metaphorHtmls.map(unsafeHTML)}</span></div>
              </div>
            </button>
          `
        )}
      </div>
      ${hasMore
        ? html`
            <button
              @click=${() => {
                currentDisplayLimit += DISPLAY_INCREMENT;
                renderResults(results, currentDisplayLimit);
              }}
              style="margin: 20px auto; display: block; padding: 10px 20px; cursor: pointer;"
            >
              Show more (${results.length - limit} remaining)
            </button>
          `
        : null}
    `,
    resultsContainer
  );

  // Observe new icons after render
  requestAnimationFrame(() => {
    resultsContainer.querySelectorAll(".icon").forEach((icon) => {
      if (!loadedIcons.has(icon)) {
        iconObserver.observe(icon);
      }
    });
  });
}

const searchInput = document.querySelector(`[name="query"]`) as HTMLInputElement;
fromEvent(searchInput, "input")
  .pipe(
    debounceTime(50),
    switchMap(async () => {
      if (!searchInput.value) return [];
      const channel = new MessageChannel();
      worker.postMessage(
        {
          searchQuery: searchInput.value,
        },
        [channel.port2]
      );

      channel.port1.start();
      return new Promise<SearchResult[]>((resolve) => {
        channel.port1.addEventListener(
          "message",
          (event) => {
            resolve(event.data.searchResults);
            channel.port1.close();
          },
          { once: true }
        );
      });
    }),
    tap((results) => {
      if (results) {
        console.log("Search results:", results);
        // Reset limit on new query
        currentDisplayLimit = DISPLAY_INITIAL_LIMIT;
        currentResults = results;
        renderResults(currentResults, currentDisplayLimit);
      }
    })
  )
  .subscribe();
