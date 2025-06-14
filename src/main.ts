import { html, render } from "lit-html";
import { repeat } from "lit-html/directives/repeat.js";
import { fromEvent, switchMap, tap } from "rxjs";
import type { SearchResult } from "../typings/icon-index";
import SearchWorker from "./worker?worker";

const worker = new SearchWorker();
const resultsContainer = document.querySelector("#results") as HTMLElement;

// Track loaded icons to avoid re-observing
const loadedIcons = new WeakSet<Element>();

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

// Set up MutationObserver to watch for new icons
const mutationObserver = new MutationObserver((mutations) => {
  mutations.forEach((mutation) => {
    mutation.addedNodes.forEach((node) => {
      if (node.nodeType === Node.ELEMENT_NODE) {
        const element = node as Element;
        if (element.classList.contains("icon") && !loadedIcons.has(element)) {
          iconObserver.observe(element);
        }
        // Also check for icon children if a container was added
        element.querySelectorAll(".icon").forEach((icon) => {
          if (!loadedIcons.has(icon)) {
            iconObserver.observe(icon);
          }
        });
      }
    });
  });
});

// Start observing the results container
mutationObserver.observe(resultsContainer, {
  childList: true,
  subtree: true,
});

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

        render(
          repeat(
            results.slice(0, 100), // sensible limit
            (icon) => icon.name,
            (icon) => html`
              <div class="icon" data-filename="${icon.filename}" data-style="${icon.options.map((opt) => opt.style).join(",")}">
                <div class="svg-container" style="height: 24px; display: flex; gap: 8px">
                  <!-- SVG will be loaded when visible -->
                </div>
                <span>${icon.name}</span>
              </div>
            `
          ),
          resultsContainer
        );
      }
    })
  )
  .subscribe();
