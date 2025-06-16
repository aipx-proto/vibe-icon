/// <reference lib="webworker" />
import type { IconIndex, InMemoryIcon, SearchResult } from "../typings/icon-index";

// handle messages from the main thread
self.onmessage = async (event: MessageEvent) => {
  const { searchQuery, aiQuery } = event.data ?? {};
  const channel = event.ports[0];

  if (searchQuery !== undefined) {
    try {
      const results = await searchIcons(searchQuery);
      channel.postMessage({
        searchResults: results,
      });
    } catch (error) {
      console.error("Error during search:", error);
      channel.postMessage({
        searchResults: [],
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  if (aiQuery !== undefined) {
    try {
      const { settings, query } = aiQuery as { settings: Record<string, any>; query: string };
      const aiResults = await askAI(settings, query);
      channel.postMessage({
        aiResults,
      });
    } catch (error) {
      console.error("Error during AI search:", error);
      channel.postMessage({
        aiResults: [],
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }
};

const indexAsync = decompressIndex();

async function askAI(settings: any, query: string): Promise<SearchResult[]> {
  const [openai, iconSheet] = await Promise.all([import("openai"), fetch(`${import.meta.env.BASE_URL}/index.csv`).then((res) => res.text())]);

  const client = new openai.AzureOpenAI({
    endpoint: settings.endpoint,
    apiKey: settings.apiKey,
    deployment: settings.deployment,
    apiVersion: settings.apiVersion,
    dangerouslyAllowBrowser: true,
  });

  const result = await client.responses.parse({
    model: settings.model,
    input: [
      {
        role: "developer",
        content: `
Help user choose the best icon from the sheet below. Try match user's query with the best icon name and metaphors.

\`\`\`csv
${iconSheet}
\`\`\`

Now respond with the names of the top matching icons, quality over quantity. In this JSON format:
{
  iconNames: string[]
}
            `,
      },
      { role: "user", content: query },
    ],
    text: {
      format: {
        type: "json_object",
      },
    },
  });

  const structuredResult = JSON.parse(result.output_text) ?? {};
  const index = await indexAsync;

  const iconNames = structuredResult.iconNames || [];
  const results: SearchResult[] = index.icons
    .filter((icon) => iconNames.includes(icon.name))
    .map((icon) => ({
      ...icon,
      nameHtml: icon.name,
      metaphorHtmls: icon.metaphors.map((metaphor) => metaphor),
      score: 100, // AI results are considered perfect matches
    }));

  return results;
}

async function searchIcons(query: string) {
  const isEmpty = !query || query.trim() === "";
  const index = await indexAsync;
  const lowerquery = query.toLowerCase();
  const results: SearchResult[] = index.icons
    .filter((icon) => {
      return isEmpty ? true : icon.lowerName.includes(lowerquery) || icon.metaphors.some((metaphor) => metaphor.includes(lowerquery));
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
  if (!query) return 0;

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
  const iconsIndex = await fetch(`${basename}/index.json`).then((response) => response.json() as Promise<IconIndex>);

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
