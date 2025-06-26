import { html, render } from "lit-html";
import { repeat } from "lit-html/directives/repeat.js";
import { unsafeHTML } from "lit-html/directives/unsafe-html.js";
import type { BehaviorSubject } from "rxjs";
import type { SearchResult } from "../../typings/icon-index";
import { iconObserver, isIconLoaded } from "../icon-observer";
import { copyIconToClipboard } from "./copy-icon";
import "./results.css";

type SearchState = "idle" | "searching" | "ai-searching" | "completed" | "error";

interface RenderResultsContext {
  resultsContainer: HTMLElement;
  searchInput: HTMLInputElement;
  selectedIcon$: BehaviorSubject<SearchResult | null>;
  searchState: SearchState;
  isAISearch: boolean;
  currentDisplayLimit: number;
  DISPLAY_INCREMENT: number;
  searchErrorMessage: string | null;
}

// Function to render results with show more button
export function renderResults(results: SearchResult[], limit: number, context: RenderResultsContext) {
  const visibleResults = results.slice(0, limit);
  const hasMore = results.length > limit;
  const currentSelectedIcon = context.selectedIcon$.value;

  // Handle different states
  if (context.searchState === "error") {
    render(html` <div class="result-status">⚠️ ${context.searchErrorMessage || "An unexpected error occurred."}</div> `, context.resultsContainer);
    return;
  }

  if (context.searchState === "ai-searching") {
    render(html` <div class="result-status">😎 Matching the best icons by vibe...</div> `, context.resultsContainer);
    return;
  }

  if (context.searchState === "completed" && results.length === 0) {
    if (context.isAISearch) {
      render(
        html` <div class="result-status">No results from AI search. Please elaborate what the icon is used for and try again</div> `,
        context.resultsContainer
      );
    } else if (context.searchInput.value.trim() !== "") {
      render(html` <div class="result-status">No exact match. Press <kbd>ENTER</kbd> to try AI search</div> `, context.resultsContainer);
    } else {
      // Empty search input, don't show any message
      render(html``, context.resultsContainer);
    }
    return;
  }

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
                  const currentSelectedIconFromSubject = context.selectedIcon$.value;

                  if (currentSelectedIconFromSubject?.name === icon.name) {
                    // Already selected, so copy
                    if (buttonElement.querySelector(".copy-overlay")) {
                      return; // Prevent re-triggering if overlay is already shown
                    }
                    const html = `<vibe-icon name="${icon.filename.split(".svg")[0]}"></vibe-icon>`;
                    await copyIconToClipboard(html, buttonElement, "✅ HTML copied");
                  } else {
                    context.selectedIcon$.next(icon);
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
                context.currentDisplayLimit += context.DISPLAY_INCREMENT;
                renderResults(results, context.currentDisplayLimit, context);
              }}
              style="margin: 20px auto; display: block; padding: 10px 20px; cursor: pointer;"
            >
              Show more (${results.length - limit} remaining)
            </button>
          `
        : null}
    `,
    context.resultsContainer
  );

  // Observe new icons after render
  requestAnimationFrame(() => {
    context.resultsContainer.querySelectorAll(".icon").forEach((icon) => {
      if (!isIconLoaded(icon)) {
        iconObserver.observe(icon);
      }
    });
  });
}
