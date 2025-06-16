import { html, render } from "lit-html";
import { repeat } from "lit-html/directives/repeat.js";
import { unsafeHTML } from "lit-html/directives/unsafe-html.js";
import { BehaviorSubject, debounceTime, fromEvent, startWith, switchMap, tap } from "rxjs";
import "vibe-button";
import type { SearchResult } from "../typings/icon-index";
import { iconObserver, isIconLoaded } from "./icon-observer";
import { initKeyboardNavigation } from "./keyboard-navigation";
import "./style.css";
import { generateSvgFromSymbol } from "./svg"; // Added import
import { CodeSnippet } from "./views/code-snippet";
import { copyIconToClipboard } from "./views/copy-icon"; // Added import
import { renderDetails } from "./views/details";
import SearchWorker from "./worker?worker";

CodeSnippet.define();

const worker = new SearchWorker();
const resultsContainer = document.querySelector("#results") as HTMLElement;
const detailsContainer = document.querySelector("#details") as HTMLElement;
const searchInput = document.querySelector(`[name="query"]`) as HTMLInputElement;
const vibeButton = document.querySelector("vibe-button")!;
const aiSearchButton = document.querySelector("#ai-search") as HTMLButtonElement;

fromEvent(aiSearchButton, "click")
  .pipe(
    switchMap(async () => {
      const settings = vibeButton.settings;
    })
  )
  .subscribe();

// State for pagination
let currentResults: SearchResult[] = [];
const DISPLAY_INITIAL_LIMIT = 48; // Initial number of icons to display
const DISPLAY_INCREMENT = 48;
let currentDisplayLimit = DISPLAY_INITIAL_LIMIT;

// Create BehaviorSubject for selected icon
const selectedIcon$ = new BehaviorSubject<SearchResult | null>(null);

// Subscribe to selected icon changes and update details panel
selectedIcon$
  .pipe(
    switchMap(async (icon) => {
      if (icon) {
        // Re-render results to update selected state
        renderResults(currentResults, currentDisplayLimit);
        await renderDetails(icon, detailsContainer);
      } else {
        // Clear details panel when no icon is selected
        render(html``, detailsContainer);
      }
    })
  )
  .subscribe();

// Initialize Keyboard Navigation
initKeyboardNavigation({
  resultsContainer,
  detailsContainer,
  searchInput,
  selectedIcon$,
  getCurrentResults: () => currentResults,
  getDisplayLimit: () => currentDisplayLimit,
  setDisplayLimit: (newLimit) => {
    currentDisplayLimit = newLimit;
  },
  renderResultsFn: renderResults,
  DISPLAY_INCREMENT,
});

fromEvent(searchInput, "input")
  .pipe(
    debounceTime(50),
    startWith(""), // Trigger initial search
    switchMap(async () => {
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
          (icon, index) => {
            const isSelected = currentSelectedIcon?.name === icon.name;
            const isFirstIcon = index === 0 && !currentSelectedIcon;
            const tabIndex = isSelected || isFirstIcon ? 0 : -1;

            return html`
              <button
                class="icon"
                data-filename="${icon.filename}"
                data-style="${icon.options.map((opt) => opt.style).join(",")}"
                data-selected="${isSelected}"
                tabindex="${tabIndex}"
                @click=${async (event: Event) => {
                  const buttonElement = event.currentTarget as HTMLElement;
                  const currentSelectedIconFromSubject = selectedIcon$.value;

                  if (currentSelectedIconFromSubject?.name === icon.name) {
                    // Already selected, so copy
                    if (buttonElement.querySelector(".copy-overlay")) {
                      return; // Prevent re-triggering if overlay is already shown
                    }
                    try {
                      const response = await fetch(`${import.meta.env.BASE_URL}/${icon.filename}`);
                      if (!response.ok) {
                        throw new Error(`Failed to fetch SVG: ${response.statusText}`);
                      }
                      const svgText = await response.text();
                      const svgDoc = new DOMParser().parseFromString(svgText, "image/svg+xml");

                      // Determine the style to use - default to 'regular' or the first option
                      let styleToCopy = "regular";
                      const regularOption = icon.options.find((opt) => opt.style === "regular");
                      if (!regularOption && icon.options.length > 0) {
                        styleToCopy = icon.options[0].style; // Fallback to the first available style
                      }

                      const inlinedSvgContent = generateSvgFromSymbol(svgDoc, styleToCopy);

                      if (!inlinedSvgContent) {
                        throw new Error(`Failed to generate SVG for style '${styleToCopy}' from ${icon.filename}`);
                      }

                      await copyIconToClipboard(inlinedSvgContent, buttonElement);
                    } catch (err) {
                      console.error("Failed to copy SVG from grid icon: ", err);
                      // Ensure error overlay is handled by copyIconToClipboard by passing the buttonElement
                      await copyIconToClipboard("", buttonElement, "", "❌ Error copying");
                    }
                  } else {
                    selectedIcon$.next(icon);
                  }
                }}
              >
                <div class="svg-container" style="height: 48px; display: flex; gap: 8px">
                  <!-- SVG will be loaded when visible -->
                </div>
                <div class="icon-name" title="${icon.name}">${unsafeHTML(icon.nameHtml)}</div>
                <div hidden>
                  <div><span>${icon.metaphorHtmls.map(unsafeHTML)}</span></div>
                </div>
              </button>
            `;
          }
        )}
      </div>
      ${hasMore
        ? html`
            <button
              tabindex="-1"
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
