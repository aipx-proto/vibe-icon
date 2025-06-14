import { html, render } from "lit-html";
import { repeat } from "lit-html/directives/repeat.js";
import { fromEvent, switchMap, tap } from "rxjs";
import type { SearchResult } from "../typings/icon-index";
import SearchWorker from "./worker?worker";

const worker = new SearchWorker();
const resultsContainer = document.querySelector("#results") as HTMLElement;

// Track loaded icons to avoid re-observing
const loadedIcons = new WeakSet<Element>();

// State for pagination
let currentResults: SearchResult[] = [];
let displayLimit = 50;

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
            .map((style) => {
              return `<svg width="24" height="24">
              <use href="/${filename}#${style}" />
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

// Function to render results with show more button
function renderResults(results: SearchResult[], limit: number) {
  const visibleResults = results.slice(0, limit);
  const hasMore = results.length > limit;

  render(
    html`
      ${repeat(
        visibleResults,
        (icon) => icon.name,
        (icon) => html`
          <div class="icon" data-filename="${icon.filename}" data-style="${icon.options.map((opt) => opt.style).join(",")}">
            <div class="svg-container" style="height: 24px; display: flex; gap: 8px">
              <!-- SVG will be loaded when visible -->
            </div>
            <span>${icon.name}</span>
          </div>
        `
      )}
      ${hasMore
        ? html`
            <button
              @click=${() => {
                displayLimit += 50;
                renderResults(results, displayLimit);
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
    switchMap(async () => {
      if (!searchInput.value) return;
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
        displayLimit = 50;
        currentResults = results;
        renderResults(currentResults, displayLimit);
      }
    })
  )
  .subscribe();
