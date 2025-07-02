import { BehaviorSubject, fromEvent, tap } from "rxjs";
import type { SearchResult } from "../typings/icon-index";

interface KeyboardNavigationParams {
  resultsContainer: HTMLElement;
  detailsContainer: HTMLElement;
  searchInput: HTMLInputElement;
  selectedIcon$: BehaviorSubject<SearchResult | null>;
  getCurrentResults: () => SearchResult[];
  getDisplayLimit: () => number;
  setDisplayLimit: (newLimit: number) => void;
  renderResultsFn: (results: SearchResult[], limit: number) => void;
  DISPLAY_INCREMENT: number;
  getSearchState: () => string; // Changed from SearchState to string for simplicity, can be refined
  aiSearchButton: HTMLButtonElement;
}

export function initKeyboardNavigation({
  resultsContainer,
  detailsContainer,
  searchInput,
  selectedIcon$,
  getCurrentResults,
  getDisplayLimit,
  setDisplayLimit,
  renderResultsFn,
  DISPLAY_INCREMENT,
  getSearchState,
  aiSearchButton,
}: KeyboardNavigationParams): void {
  const focusOnIconFromSearch = () => {
    const selectedIconElement = resultsContainer.querySelector('.icon[data-selected="true"]') as HTMLButtonElement;
    if (selectedIconElement) {
      selectedIconElement.focus();
      selectedIconElement.scrollIntoView({ behavior: "smooth", block: "nearest" });
      return;
    }

    const firstIcon = resultsContainer.querySelector(".icon") as HTMLButtonElement;
    if (firstIcon) {
      firstIcon.click(); // This will trigger selectedIcon$.next via the button's event handler
      firstIcon.focus();
    }
  };

  fromEvent<KeyboardEvent>(document, "keydown")
    .pipe(
      tap((event) => {
        if ((event.ctrlKey || event.metaKey) && event.key === "k") {
          event.preventDefault();
          searchInput.focus();
          searchInput.select();
          return;
        }

        if (event.key === "Escape") {
          if (document.activeElement === searchInput) return;
          event.preventDefault();
          if (detailsContainer.contains(document.activeElement)) {
            const selectedIconElement = resultsContainer.querySelector(
              '.icon[data-selected="true"]',
            ) as HTMLButtonElement;
            if (selectedIconElement) {
              selectedIconElement.focus();
              selectedIconElement.scrollIntoView({ behavior: "smooth", block: "nearest" });
            }
            return;
          }
          if (
            document.activeElement?.classList.contains("icon") &&
            document.activeElement?.getAttribute("data-selected") === "true"
          ) {
            searchInput.focus();
            searchInput.select();
            return;
          }
        }

        if (event.key === "Enter" && document.activeElement?.classList.contains("icon")) {
          event.preventDefault();
          requestAnimationFrame(() => {
            const firstHtmlButton = detailsContainer.querySelector(
              ".icon-info menu button:first-child",
            ) as HTMLButtonElement;
            firstHtmlButton?.focus();
          });
          return;
        }

        if (document.activeElement === searchInput && event.key === "ArrowDown") {
          event.preventDefault();
          focusOnIconFromSearch();
          return;
        }

        // Handle Enter key for AI search when searchInput is focused
        if (document.activeElement === searchInput && event.key === "Enter") {
          const currentSearchState = getSearchState();
          if (currentSearchState === "completed" && searchInput.value.trim() !== "") {
            // Prevent default form submission or other Enter key actions
            event.preventDefault();
            aiSearchButton.click();
            return; // Ensure no other keydown logic for Enter on searchInput runs
          }
        }

        if (document.activeElement === searchInput || !resultsContainer.contains(document.activeElement)) return;

        const currentResults = getCurrentResults();
        const currentDisplayLimit = getDisplayLimit();
        const visibleResults = currentResults.slice(0, currentDisplayLimit);
        if (visibleResults.length === 0) return;

        const currentSelectedIconValue = selectedIcon$.value;
        const currentIndex = currentSelectedIconValue
          ? visibleResults.findIndex((icon) => icon.name === currentSelectedIconValue.name)
          : -1;
        let newIndex = currentIndex;

        const iconGrid = resultsContainer.querySelector(".icon-grid");
        if (!iconGrid) return;
        const firstIconElement = iconGrid.querySelector(".icon");
        if (!firstIconElement) return;

        const iconStyle = window.getComputedStyle(firstIconElement as HTMLElement);
        const iconWidth =
          (firstIconElement as HTMLElement).offsetWidth +
          parseFloat(iconStyle.marginLeft) +
          parseFloat(iconStyle.marginRight);
        const gridWidth = (iconGrid as HTMLElement).offsetWidth;
        const columns = Math.max(1, Math.floor(gridWidth / iconWidth));

        switch (event.key) {
          case "ArrowUp":
            event.preventDefault();
            if (currentIndex < columns) {
              searchInput.focus();
              return;
            }
            newIndex = currentIndex - columns;
            if (newIndex < 0) newIndex = currentIndex; // Should not happen if previous check is correct
            break;
          case "ArrowDown":
            event.preventDefault();
            newIndex = currentIndex + columns;
            if (newIndex >= visibleResults.length) {
              if (currentResults.length > currentDisplayLimit) {
                const newLimit = currentDisplayLimit + DISPLAY_INCREMENT;
                setDisplayLimit(newLimit);
                renderResultsFn(currentResults, newLimit);
                requestAnimationFrame(() => {
                  const nextIconToSelect = currentResults[currentIndex + columns]; // Use original currentResults
                  if (nextIconToSelect) {
                    selectedIcon$.next(nextIconToSelect);
                    const iconElement = resultsContainer.querySelector(
                      `[data-filename="${nextIconToSelect.filename}"]`,
                    ) as HTMLElement;
                    iconElement?.focus();
                    iconElement?.scrollIntoView({ behavior: "smooth", block: "nearest" });
                  }
                });
                return;
              }
              newIndex = currentIndex; // Stay if no more items and cannot load more
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
              if (currentResults.length > currentDisplayLimit) {
                const newLimit = currentDisplayLimit + DISPLAY_INCREMENT;
                setDisplayLimit(newLimit);
                renderResultsFn(currentResults, newLimit);
                requestAnimationFrame(() => {
                  const nextIconToSelect = currentResults[currentIndex + 1]; // Use original currentResults
                  if (nextIconToSelect) {
                    selectedIcon$.next(nextIconToSelect);
                    const iconElement = resultsContainer.querySelector(
                      `[data-filename="${nextIconToSelect.filename}"]`,
                    ) as HTMLElement;
                    iconElement?.focus();
                    iconElement?.scrollIntoView({ behavior: "smooth", block: "nearest" });
                  }
                });
                return;
              }
              newIndex = Math.max(0, visibleResults.length - 1);
            }
            break;
          default:
            return;
        }

        if (
          newIndex !== currentIndex &&
          newIndex >= 0 &&
          newIndex < Math.min(currentResults.length, getDisplayLimit())
        ) {
          // Ensure newIndex is within bounds of potentially updated visibleResults after render
          const newVisibleResults = currentResults.slice(0, getDisplayLimit());
          if (newIndex < newVisibleResults.length) {
            const newIcon = newVisibleResults[newIndex];
            selectedIcon$.next(newIcon);
            requestAnimationFrame(() => {
              const iconElement = resultsContainer.querySelector(
                `[data-filename="${newIcon.filename}"]`,
              ) as HTMLElement;
              if (iconElement) {
                iconElement.focus();
                iconElement.scrollIntoView({ behavior: "smooth", block: "nearest" });
              }
            });
          }
        }
      }),
    )
    .subscribe();
}
