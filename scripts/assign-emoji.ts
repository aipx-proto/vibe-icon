import { readdir, readFile, writeFile } from "fs/promises";
import { resolve, extname, basename } from "path";
import { existsSync } from "fs";
import { config } from "dotenv";
import { OpenAI } from "openai";
import { from, mergeMap, lastValueFrom } from "rxjs";
import { updateProgress } from "./progress-bar";

// Load environment variables from specific file
const envFile = process.argv[2] || ".env.aoai";
config({ path: resolve(envFile) });

const pngDir = resolve("pngs");
const publicDir = resolve("public");
const outputFile = resolve("emoji-assignments.json");

// Azure OpenAI configuration
const azureOpenAI = new OpenAI({
  apiKey: process.env.AZURE_OPENAI_API_KEY,
  baseURL: `${process.env.AZURE_OPENAI_ENDPOINT}/openai/deployments/${process.env.AZURE_OPENAI_MODEL}`,
  defaultQuery: { "api-version": "2024-02-15-preview" },
  defaultHeaders: {
    "api-key": process.env.AZURE_OPENAI_API_KEY,
  },
});

interface IconMetadata {
  name: string;
  metaphor?: string[];
  options: Array<{
    size: number;
    style: string;
  }>;
}

interface EmojiAssignmentResponse {
  emoji: string;
  subEmoji?: string;
  alternativeEmojis: string[];
  similarity: number;
}

interface EmojiAssignment extends EmojiAssignmentResponse {
  filename: string;
  iconName: string;
  metaphors: string[];
}

main();

async function main() {
  console.log("Starting emoji assignment process...");
  console.log(`Loading credentials from: ${envFile}`);

  // Validate environment variables
  if (!process.env.AZURE_OPENAI_API_KEY || !process.env.AZURE_OPENAI_ENDPOINT || !process.env.AZURE_OPENAI_MODEL) {
    console.error(`Missing required environment variables. Please check your ${envFile} file.`);
    console.error("Required variables: AZURE_OPENAI_API_KEY, AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_MODEL");
    console.error(`\nCreate ${envFile} with your Azure OpenAI credentials:`);
    console.error("AZURE_OPENAI_API_KEY=your_api_key");
    console.error("AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com");
    console.error("AZURE_OPENAI_MODEL=your_deployment_name");
    process.exit(1);
  }

  // Check if PNG directory exists
  if (!existsSync(pngDir)) {
    console.error(`PNG directory not found: ${pngDir}`);
    console.error("Please run 'npm run svg-to-png' first to generate PNG files.");
    process.exit(1);
  }

  console.log("Scanning for PNG files...");
  const allPngFiles = await getPngFiles();

  if (allPngFiles.length === 0) {
    console.log("No PNG files found for emoji assignment.");
    return;
  }

  // TEMP: Limit to first 50 files for testing
  const pngFiles = allPngFiles.slice(0, 50);

  console.log(`Found ${allPngFiles.length} PNG files total`);
  console.log(`Processing first ${pngFiles.length} files (TEMP LIMIT)`);

  let progress = 0;
  let errors = 0;
  const assignments: EmojiAssignment[] = [];

  const analysis$ = from(pngFiles).pipe(
    mergeMap(async (pngFile) => {
      try {
        const assignment = await assignEmoji(pngFile);
        assignments.push(assignment);
      } catch (error) {
        console.error(`Failed to assign emoji for ${pngFile}:`, error);
        errors++;
      }
      updateProgress(++progress, pngFiles.length, "Analyzing icons for emoji assignment", errors);
    }, 3) // Process 3 files concurrently to avoid rate limits
  );

  await lastValueFrom(analysis$);

  // Save assignments to JSON file
  await saveAssignments(assignments);

  console.log(`\nEmoji assignment completed!`);
  console.log(`Successfully assigned emojis to ${assignments.length} icons.`);
  if (errors > 0) {
    console.log(`${errors} files failed to process.`);
  }
  console.log(`Results saved to: ${outputFile}`);
}

async function getPngFiles(): Promise<string[]> {
  try {
    const files = await readdir(pngDir);
    const pngFiles = files.filter((file) => extname(file) === ".png").map((file) => resolve(pngDir, file));

    return pngFiles;
  } catch (error) {
    console.error("Failed to read PNG directory:", error);
    return [];
  }
}

async function readIconMetadata(iconName: string): Promise<{ name: string; metaphors: string[] }> {
  const metadataPath = resolve(publicDir, `${iconName}.metadata.json`);
  
  try {
    const metadataContent = await readFile(metadataPath, "utf-8");
    const metadata: IconMetadata = JSON.parse(metadataContent);
    
    return {
      name: metadata.name || iconName,
      metaphors: metadata.metaphor || []
    };
  } catch (error) {
    console.warn(`Could not read metadata for ${iconName}, using filename as name`);
    return {
      name: iconName,
      metaphors: []
    };
  }
}

async function assignEmoji(pngFilePath: string): Promise<EmojiAssignment> {
  const filename = basename(pngFilePath, ".png");

  // Read icon metadata
  const { name: iconName, metaphors } = await readIconMetadata(filename);

  // Read the PNG file and convert to base64
  const imageBuffer = await readFile(pngFilePath);
  const base64Image = imageBuffer.toString("base64");



  const metaphorContext = metaphors.length > 0 
    ? `\n\nAdditional context - this icon represents concepts related to: ${metaphors.join(", ")}` 
    : "";

  try {
    const response = await azureOpenAI.chat.completions.create({
      model: process.env.AZURE_OPENAI_MODEL!,
      messages: [
        {
          role: "system",
          content: systemPrompt,
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Icon name: ${iconName}${metaphorContext}`,
            },
            {
              type: "image_url",
              image_url: {
                url: `data:image/png;base64,${base64Image}`,
              },
            },
          ],
        },
      ],
      max_tokens: 1000,
      temperature: 0.9,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error("No response content received");
    }

    // Parse the JSON response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("No JSON found in response");
    }

    const parsed = JSON.parse(jsonMatch[0]) as EmojiAssignmentResponse;

    return {
      filename,
      iconName,
      metaphors,
      ...parsed,
    };
  } catch (error) {
    console.warn(`Failed to get AI response for ${filename}, using fallback`);
    return {
      filename,
      iconName: filename,
      metaphors: [],
      emoji: "n/a",
      subEmoji: undefined,
      alternativeEmojis: [],
      similarity: 0,  
    };
  }
}

async function saveAssignments(assignments: EmojiAssignment[]): Promise<void> {
  // Sort by confidence (highest first) and then by filename
  const sortedAssignments = assignments.sort((a, b) => {
    if (b.similarity !== a.similarity) {
      return b.similarity - a.similarity;
    }
    return a.filename?.localeCompare(b.filename) || 0;
  });

  const output = {
    generated: new Date().toISOString(),
    total: assignments.length,
    assignments: sortedAssignments,
  };

  await writeFile(outputFile, JSON.stringify(output, null, 2), "utf-8");
}

const exampleResponse: EmojiAssignmentResponse = {
  emoji: "📄",
  subEmoji: "➕",
  alternativeEmojis: ["📃"],
  similarity: 0.9,
};

const systemPrompt = `
You are a helpful assistant that assigns emojis to icons.

You will be given an icon and a list of metaphors that it represents.

You will need to assign an emoji that best represents the icon.

Analyze this icon image and suggest the emoji that most closely matches it visually.

Consider:
- The main visual elements and shapes
- The overall style and appearance
- What concept or object the icon represents
- Color schemes and visual patterns
- The icon name and metaphorical concepts if provided

Respond with a JSON object containing:
- "emoji": the single best matching emoji character
- "similarity": similarity score from 0-1 - how similar the icon is to the emoji
- "subEmoji": some icons have a secondary icon in the corner of the layout that modifies the primary icon's meaning. Please skip this if it is not present.
- "alternativeEmojis": other emojis that are similar to the icon (this can be empty)

Example response format:
\`\`\`json
${JSON.stringify(exampleResponse, null, 2)}
\`\`\`
`