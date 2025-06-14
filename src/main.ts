import { html, render } from "lit-html";
import { repeat } from "lit-html/directives/repeat.js";
import { fromEvent, switchMap, tap } from "rxjs";
import type { SearchResult } from "../typings/icon-index";
import SearchWorker from "./worker?worker";

const worker = new SearchWorker();
const resultsContainer = document.querySelector("#results") as HTMLElement;

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
            results.slice(0, 24),
            (icon) => icon.name,
            (icon) => html`
              <div class="icon">
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
