import { html, render } from "lit-html";
import { repeat } from "lit-html/directives/repeat.js";
import { unsafeHTML } from "lit-html/directives/unsafe-html.js";
import { BehaviorSubject, debounceTime, fromEvent, startWith, switchMap, tap } from "rxjs";
import type { SearchResult } from "../typings/icon-index";
import { iconObserver, isIconLoaded } from "./icon-observer";
import "./style.css";
import { CodeSnippet } from "./views/code-snippet";
import { renderDetails } from "./views/details";
import SearchWorker from "./worker?worker";

CodeSnippet.define();

const worker = new SearchWorker();
const resultsContainer = document.querySelector("#results") as HTMLElement;
const detailsContainer = document.querySelector("#details") as HTMLElement;

// State for pagination
let currentResults: SearchResult[] = [];
const DISPLAY_INITIAL_LIMIT = 50; // Initial number of icons to display
const DISPLAY_INCREMENT = 50;
let currentDisplayLimit = DISPLAY_INITIAL_LIMIT;

// Create BehaviorSubject for selected icon
const selectedIcon$ = new BehaviorSubject<SearchResult | null>(null);

// Subscribe to selected icon changes and update details panel
selectedIcon$.subscribe((icon) => {
  if (icon) {
    renderDetails(icon, detailsContainer);
    // Re-render results to update selected state
    renderResults(currentResults, currentDisplayLimit);
  } else {
    // Clear details panel when no icon is selected
    render(html``, detailsContainer);
  }
});

// Function to render results with show more button
function renderResults(results: SearchResult[], limit: number) {
  const visibleResults = results.slice(0, limit);
  const hasMore = results.length > limit;
  const currentSelectedIcon = selectedIcon$.value;

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
              data-selected="${currentSelectedIcon?.name === icon.name}"
              @click=${() => selectedIcon$.next(icon)}
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
      if (!isIconLoaded(icon)) {
        iconObserver.observe(icon);
      }
    });
  });
}

const searchInput = document.querySelector(`[name="query"]`) as HTMLInputElement;
fromEvent(searchInput, "input")
  .pipe(
    debounceTime(50),
    startWith(""), // Trigger initial search
    switchMap(async () => {
      console.log("OUT");
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

        // If no icon is selected and we have results, select the first one
        if (selectedIcon$.value === null && results.length > 0) {
          selectedIcon$.next(results[0]);
        }
      }
    })
  )
  .subscribe();
