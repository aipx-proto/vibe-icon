export interface IconIndex {
  commit: string;
  icons: Record<string, [metaphors: string[], options: string[]]>;
}

export interface InMemoryIndex {
  commit: string;
  icons: {
    name: string;
    lowerName: string;
    metaphors: string[];
    options: string[];
  }[];
}

export interface InMemoryIcon {
  name: string;
  lowerName: string;
  metaphors: string[];
  options: string[];
}

export interface SearchResult extends InMemoryIcon {
  score: number;
}
