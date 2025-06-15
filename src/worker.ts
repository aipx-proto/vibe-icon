/// <reference lib="webworker" />
import type { IconIndex, InMemoryIcon, SearchResult } from "../typings/icon-index";

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
  const results: SearchResult[] = index.icons
    .filter((icon) => {
      return icon.lowerName.includes(lowerquery) || icon.metaphors.some((metaphor) => metaphor.includes(lowerquery));
    })
    .map((icon) => ({
      ...icon,
      ...getHighlight(icon, query),
      score: getMatchScore(icon, lowerquery),
    }))
    .sort((a, b) => b.score - a.score);

  return results;
}

function getHighlight(icon: InMemoryIcon, query: string): { nameHtml: string; metaphorHtmls: string[] } {
  const lowerQuery = query.toLowerCase();

  // Highlight name
  const nameIndex = icon.lowerName.indexOf(lowerQuery);
  let nameHtml = icon.name;
  if (nameIndex === 0) {
    // Prefix match
    nameHtml = `<mark>${icon.name.substring(0, query.length)}</mark>${icon.name.substring(query.length)}`;
  }

  // Highlight metaphors
  const metaphorHtmls = icon.metaphors.map((metaphor) => {
    const lowerMetaphor = metaphor.toLowerCase();
    const metaphorIndex = lowerMetaphor.indexOf(lowerQuery);
    if (metaphorIndex === 0) {
      // Prefix match
      return `<mark>${metaphor.substring(0, query.length)}</mark>${metaphor.substring(query.length)}`;
    }
    return metaphor;
  });

  return { nameHtml, metaphorHtmls };
}

function getMatchScore(icon: InMemoryIcon, query: string): number {
  // Name full match: 100
  // Name prefix match: 50 * coverage percentage
  // Name word prefix match: 10 per match * coverage percentage
  // Metaphor full match: 25
  // Metaphor prefix match: 5 * coverage percentage
  // Coverage bonus: up to 20 points based on query/target length ratio
  const lowerQuery = query.toLowerCase();
  let score = 0;

  // Name full match: 100
  if (icon.lowerName === lowerQuery) {
    return 100;
  }

  // Calculate coverage percentage for the name
  const nameCoverage = lowerQuery.length / icon.lowerName.length;

  // Name prefix match: 50 * coverage percentage
  if (icon.lowerName.startsWith(lowerQuery)) {
    score += 80 * nameCoverage;
  }

  // Name word prefix match: 10 per match * coverage
  const nameWords = icon.lowerName.split(/[-_\s]+/);
  for (const word of nameWords) {
    if (word.startsWith(lowerQuery)) {
      const wordCoverage = lowerQuery.length / word.length;
      score += 10 * wordCoverage;
    }
  }

  // Metaphor scoring with coverage
  for (const metaphor of icon.metaphors) {
    const lowerMetaphor = metaphor.toLowerCase();
    const metaphorCoverage = lowerQuery.length / lowerMetaphor.length;

    if (lowerMetaphor === lowerQuery) {
      score += 25;
    } else if (lowerMetaphor.includes(lowerQuery)) {
      // Contains match with coverage bonus
      score += 15 * metaphorCoverage;
    } else if (lowerMetaphor.startsWith(lowerQuery)) {
      // Prefix match with coverage bonus
      score += 5 * metaphorCoverage;
    }
  }

  return score;
}

async function decompressIndex() {
  const basename = import.meta.env.BASE_URL;
  const iconsIndex = await fetch(`${basename}index.json`).then((response) => response.json() as Promise<IconIndex>);

  const commit = iconsIndex.commit;
  const icons = Object.entries(iconsIndex.icons).map(([name, [metaphors, options]]) => {
    return {
      name,
      filename: name.replace(/ /g, "-").toLowerCase() + ".svg",
      lowerName: name.toLowerCase(),
      metaphors,
      options,
    };
  });

  return { commit, icons };
}
