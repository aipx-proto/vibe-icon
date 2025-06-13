import { fromEvent, tap } from "rxjs";
import SearchWorker from "./worker?worker";

const worker = new SearchWorker();

const searchInput = document.querySelector(`[name="query"]`) as HTMLInputElement;
fromEvent(searchInput, "input")
  .pipe(
    tap(async () => {
      if (!searchInput.value) return;
      const channel = new MessageChannel();
      worker.postMessage(
        {
          searchQuery: searchInput.value,
        },
        [channel.port2]
      );

      channel.port1.start();
      channel.port1.addEventListener(
        "message",
        (event) => {
          console.log("Search results:", event.data.searchResults.length);
        },
        {
          once: true,
        }
      );
    })
  )
  .subscribe();
