/// <reference lib="webworker" />
import type { IconIndex, InMemoryIcon } from "../typings/icon-index";

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
  const results = index.icons
    .filter((icon) => {
      return icon.lowerName.includes(lowerquery) || icon.metaphors.some((metaphor) => metaphor.includes(lowerquery));
    })
    .map((icon) => ({
      ...icon,
      score: getMatchScore(icon, lowerquery),
    }))
    .sort((a, b) => b.score - a.score);

  return results;
}

function getMatchScore(icon: InMemoryIcon, query: string): number {
  // Name full match: 100
  // Name word prefix match: 10 per match
  // Metaphor full match: 25
  // Metaphor prefix match: 5
  const lowerQuery = query.toLowerCase();
  let score = 0;

  // Name full match: 100
  if (icon.lowerName === lowerQuery) {
    return 100;
  }

  // Name word prefix match: 10 per match
  const nameWords = icon.lowerName.split(/[-_\s]+/);
  for (const word of nameWords) {
    if (word.startsWith(lowerQuery)) {
      score += 10;
    }
  }

  // Metaphor full match: 20
  for (const metaphor of icon.metaphors) {
    const lowerMetaphor = metaphor.toLowerCase();
    if (lowerMetaphor === lowerQuery) {
      score += 20;
    } else if (lowerMetaphor.startsWith(lowerQuery)) {
      // Metaphor prefix match: 5
      score += 5;
    }
  }

  return score;
}

async function decompressIndex() {
  const iconsIndex = await fetch("/index.min.json").then((response) => response.json() as Promise<IconIndex>);

  const commit = iconsIndex.commit;
  const icons = Object.entries(iconsIndex.icons).map(([name, [metaphors, options]]) => {
    return {
      name,
      lowerName: name.toLowerCase(),
      metaphors,
      options,
    };
  });

  return { commit, icons };
}
