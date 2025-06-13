/// <reference lib="webworker" />
import iconsIndex from "../dist-icons/light-index.json";

const indexAsync = decompressIndex();

// handle messages from the main thread
self.onmessage = async (event: MessageEvent) => {
  const { searchQuery } = event.data;
  const channel = event.ports[0];

  if (!searchQuery) return;

  const results = await searchIcons(searchQuery);
  channel.postMessage({
    searchResults: results,
  });
};

async function searchIcons(query: string) {
  const index = await indexAsync;
  const lowerquery = query.toLowerCase();
  const results = index.filter((icon) => {
    return icon.lowerName.includes(lowerquery) || icon.metaphors.some((metaphor) => metaphor.toLowerCase().includes(lowerquery));
  });

  return results;
}

async function decompressIndex() {
  return iconsIndex.icons.map((icon) => {
    const name = icon[0];
    const metaphors = icon.slice(1) as string[];

    return {
      name,
      lowerName: name.toLowerCase(),
      metaphors,
    };
  });
}
