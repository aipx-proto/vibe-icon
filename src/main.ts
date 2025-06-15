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

// Function to focus on selected icon or first icon
function focusOnIconFromSearch() {
  // First check if there's already a selected icon
  const selectedIconElement = resultsContainer.querySelector('.icon[data-selected="true"]') as HTMLButtonElement;
  if (selectedIconElement) {
    selectedIconElement.focus();
    selectedIconElement.scrollIntoView({ behavior: "smooth", block: "nearest" });
    return;
  }

  // Otherwise, find and click the first icon button
  const firstIcon = resultsContainer.querySelector(".icon") as HTMLButtonElement;
  if (firstIcon) {
    firstIcon.click();
    firstIcon.focus();
  }
}

// Add keyboard navigation for arrow keys
fromEvent<KeyboardEvent>(document, "keydown")
  .pipe(
    tap((event) => {
      // Handle Ctrl/Cmd + K to focus search box
      if ((event.ctrlKey || event.metaKey) && event.key === "k") {
        event.preventDefault();
        searchInput.focus();
        searchInput.select();
        return;
      }

      // Handle Escape key
      if (event.key === "Escape") {
        // Skip escape handling when focused on search input to preserve default behavior
        if (document.activeElement === searchInput) return;

        event.preventDefault();

        // If focus is in details container, move to selected search result button
        if (detailsContainer.contains(document.activeElement)) {
          const selectedIconElement = resultsContainer.querySelector('.icon[data-selected="true"]') as HTMLButtonElement;
          if (selectedIconElement) {
            selectedIconElement.focus();
            selectedIconElement.scrollIntoView({ behavior: "smooth", block: "nearest" });
          }
          return;
        }

        // If focus is on selected result button, move to search input
        if (document.activeElement?.classList.contains("icon") && document.activeElement?.getAttribute("data-selected") === "true") {
          searchInput.focus();
          searchInput.select();
          return;
        }
      }

      // Handle Enter key on focused icon button
      if (event.key === "Enter" && document.activeElement?.classList.contains("icon")) {
        event.preventDefault();
        // Find the first HTML copy button in the details panel
        requestAnimationFrame(() => {
          const firstHtmlButton = detailsContainer.querySelector(".icon-info menu button:first-child") as HTMLButtonElement;
          firstHtmlButton?.focus();
        });
        return;
      }

      // Handle Enter or ArrowDown when focused on search input
      if (document.activeElement === searchInput && (event.key === "ArrowDown" || event.key === "Enter")) {
        event.preventDefault();
        focusOnIconFromSearch();
        return;
      }

      // Only handle arrow keys when not focused on search input
      if (document.activeElement === searchInput) return;

      // Only handle arrow keys when focus is within the results container
      if (!resultsContainer.contains(document.activeElement)) return;

      const visibleResults = currentResults.slice(0, currentDisplayLimit);
      if (visibleResults.length === 0) return;

      const currentIndex = selectedIcon$.value ? visibleResults.findIndex((icon) => icon.name === selectedIcon$.value?.name) : -1;

      let newIndex = currentIndex;

      // Calculate grid columns dynamically
      const iconGrid = resultsContainer.querySelector(".icon-grid");
      if (!iconGrid) return;

      const firstIcon = iconGrid.querySelector(".icon");
      if (!firstIcon) return;

      const iconStyle = window.getComputedStyle(firstIcon as HTMLElement);
      const iconWidth = (firstIcon as HTMLElement).offsetWidth + parseFloat(iconStyle.marginLeft) + parseFloat(iconStyle.marginRight);
      const gridWidth = (iconGrid as HTMLElement).offsetWidth;
      const columns = Math.floor(gridWidth / iconWidth) || 1;

      switch (event.key) {
        case "ArrowUp":
          event.preventDefault();
          // If in the top row, focus back to search input
          if (currentIndex < columns) {
            searchInput.focus();
            return;
          }
          newIndex = currentIndex - columns;
          if (newIndex < 0) newIndex = currentIndex;
          break;
        case "ArrowDown":
          event.preventDefault();
          newIndex = currentIndex + columns;
          if (newIndex >= visibleResults.length) {
            // Check if we need to show more
            if (currentResults.length > currentDisplayLimit) {
              currentDisplayLimit += DISPLAY_INCREMENT;
              renderResults(currentResults, currentDisplayLimit);
              // After render, focus on the next item
              requestAnimationFrame(() => {
                const nextIcon = visibleResults[currentIndex + columns];
                if (nextIcon) {
                  selectedIcon$.next(nextIcon);
                  const iconElement = resultsContainer.querySelector(`[data-filename="${nextIcon.filename}"]`) as HTMLElement;
                  iconElement?.focus();
                  iconElement?.scrollIntoView({ behavior: "smooth", block: "nearest" });
                }
              });
              return;
            }
            newIndex = currentIndex;
          }
          break;
        case "ArrowLeft":
          event.preventDefault();
          newIndex = currentIndex - 1;
          if (newIndex < 0) newIndex = 0;
          break;
        case "ArrowRight":
          event.preventDefault();
          newIndex = currentIndex + 1;
          if (newIndex >= visibleResults.length) {
            // Check if we need to show more
            if (currentResults.length > currentDisplayLimit) {
              currentDisplayLimit += DISPLAY_INCREMENT;
              renderResults(currentResults, currentDisplayLimit);
              // After render, focus on the next item
              requestAnimationFrame(() => {
                const nextIcon = visibleResults[currentIndex + 1];
                if (nextIcon) {
                  selectedIcon$.next(nextIcon);
                  const iconElement = resultsContainer.querySelector(`[data-filename="${nextIcon.filename}"]`) as HTMLElement;
                  iconElement?.focus();
                  iconElement?.scrollIntoView({ behavior: "smooth", block: "nearest" });
                }
              });
              return;
            }
            newIndex = visibleResults.length - 1;
          }
          break;
        default:
          return;
      }

      if (newIndex !== currentIndex && newIndex >= 0 && newIndex < visibleResults.length) {
        const newIcon = visibleResults[newIndex];
        selectedIcon$.next(newIcon);

        // Focus and scroll to the new icon
        requestAnimationFrame(() => {
          const iconElement = resultsContainer.querySelector(`[data-filename="${newIcon.filename}"]`) as HTMLElement;
          if (iconElement) {
            iconElement.focus();
            iconElement.scrollIntoView({ behavior: "smooth", block: "nearest" });
          }
        });
      }
    })
  )
  .subscribe();

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
