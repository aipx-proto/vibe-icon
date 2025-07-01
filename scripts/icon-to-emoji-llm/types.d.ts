interface EmojiAssignmentResponse {
  emoji: string;
  subEmoji?: string;
  alternativeEmojis: string[];
  similarity: number;
}

interface PngMetadata extends Omit<MetadataEntry, "options"> {
  filename: string;
}

interface EmojiAssignment extends PngMetadata, EmojiAssignmentResponse {}