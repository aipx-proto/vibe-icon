export interface IconIndex {
  commit: string;
  icons: Record<string, [metaphors: string[], options: IconOption[]]>;
}

export type MetadataMap = Record<string, { options: IconOption[] }>;

export interface MetadataEntry {
  name: string;
  options: IconOption[];
}

export interface IconOption {
  size: number;
  style: string;
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
  filename: string;
  metaphors: string[];
  options: IconOption[];
}

export interface SearchResult extends InMemoryIcon {
  score: number;
  nameHtml: string;
  metaphorHtmls: string[];
}
