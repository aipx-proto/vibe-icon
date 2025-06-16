import { html, render } from "lit-html";
import { BehaviorSubject, debounceTime, fromEvent, startWith, switchMap, tap } from "rxjs";
import "vibe-button";
import type { SearchResult } from "../typings/icon-index";
import { initKeyboardNavigation } from "./keyboard-navigation";
import "./style.css";
import { CodeSnippet } from "./views/code-snippet";
import { renderDetails } from "./views/details";
import { renderResults as renderResultsImpl } from "./views/results"; // Added import
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
    tap(() => {
      // Set AI searching state
      searchState = "ai-searching";
      isAISearch = true;
      searchErrorMessage = null; // Clear previous errors
      renderResults([], 0); // Show loading state
    }),
    switchMap(async () => {
      if (!searchInput.value.trim()) return { aiResults: [], error: null };

      const settings = vibeButton.settings;
      const channel = new MessageChannel();
      worker.postMessage(
        {
          aiQuery: {
            settings,
            query: searchInput.value,
          },
        },
        [channel.port2]
      );

      channel.port1.start();
      return new Promise<{ aiResults: SearchResult[]; error: any }>((resolve) => {
        channel.port1.addEventListener(
          "message",
          (event) => {
            resolve(event.data); // Resolve with the whole data object
            channel.port1.close();
          },
          { once: true }
        );
      });
    }),
    tap((data) => {
      const results = data.aiResults;
      const error = data.error;
      console.log("AI Search Data:", data);

      if (error) {
        searchState = "error";
        searchErrorMessage = typeof error === "string" ? error : error.message || "AI search failed. Please try again.";
        currentResults = [];
        renderResults(currentResults, 0);
      } else {
        searchState = "completed";
        if (results) {
          // Reset limit on new AI search
          currentDisplayLimit = DISPLAY_INITIAL_LIMIT;
          currentResults = results;
          renderResults(currentResults, currentDisplayLimit);

          // If no icon is selected and we have results, select the first one
          if (selectedIcon$.value === null && results.length > 0) {
            selectedIcon$.next(results[0]);
          }
        }
      }
    })
  )
  .subscribe();

// State for pagination
let currentResults: SearchResult[] = [];
const DISPLAY_INITIAL_LIMIT = 48; // Initial number of icons to display
const DISPLAY_INCREMENT = 48;
let currentDisplayLimit = DISPLAY_INITIAL_LIMIT;

// Add state for search status
type SearchState = "idle" | "searching" | "ai-searching" | "completed" | "error";
let searchState: SearchState = "idle";
let isAISearch = false;
let searchErrorMessage: string | null = null;

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

// Wrapper function for renderResults that passes the context
function renderResults(results: SearchResult[], limit: number) {
  renderResultsImpl(results, limit, {
    resultsContainer,
    searchInput,
    selectedIcon$,
    searchState,
    isAISearch,
    currentDisplayLimit,
    DISPLAY_INCREMENT,
    searchErrorMessage,
  });
}

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
  getSearchState: () => searchState,
  renderResultsFn: renderResults,
  DISPLAY_INCREMENT,
  aiSearchButton,
});

fromEvent(searchInput, "input")
  .pipe(
    debounceTime(50),
    startWith(""), // Trigger initial search
    tap(() => {
      // Reset to keyword search when user types
      isAISearch = false;
      searchState = "searching";
      searchErrorMessage = null; // Clear previous errors
    }),
    switchMap(async () => {
      const channel = new MessageChannel();
      worker.postMessage(
        {
          searchQuery: searchInput.value,
        },
        [channel.port2]
      );

      channel.port1.start();
      return new Promise<{ searchResults: SearchResult[]; error: any }>((resolve) => {
        channel.port1.addEventListener(
          "message",
          (event) => {
            resolve(event.data); // Resolve with the whole data object
            channel.port1.close();
          },
          { once: true }
        );
      });
    }),
    tap((data) => {
      const results = data.searchResults;
      const error = data.error;

      if (error) {
        searchState = "error";
        searchErrorMessage = typeof error === "string" ? error : error.message || "Keyword search failed. Please try again.";
        currentResults = [];
        renderResults(currentResults, 0);
      } else {
        searchState = "completed";
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
      }
    })
  )
  .subscribe();
