import { fromEvent, switchMap, tap } from "rxjs";
import SearchWorker from "./worker?worker";

const worker = new SearchWorker();

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
      return new Promise((resolve) => {
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
      }
    })
  )
  .subscribe();
