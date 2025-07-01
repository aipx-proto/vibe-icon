import { readdir, readFile, writeFile } from "fs/promises";
import { resolve, extname, basename } from "path";
import { existsSync, readFileSync } from "fs";
import { config } from "dotenv";
import { OpenAI } from "openai";
import { from, mergeMap, lastValueFrom } from "rxjs";
import { updateProgress } from "../utils/progress-bar";
import type { MetadataEntry } from "../../typings/icon-index";
import { createFewShotExamples, createUserMessage } from "./create-examples";

const systemPromptMd = readFileSync(resolve("scripts", "icon-to-emoji-llm", "systemPrompt.md"), "utf-8");

// Load environment variables from specific file
const envFile = process.argv[2] || ".env.aoai";
config({ path: resolve(envFile) });

const pngDir = resolve("pngs");
const publicDir = resolve("public");
const outputFile = resolve("scripts", "icon-to-emoji-llm", "emoji-assignments.json");

const fewShotExamples = await createFewShotExamples(pngDir);

// Azure OpenAI configuration
const azureOpenAI = new OpenAI({
  apiKey: process.env.AZURE_OPENAI_API_KEY,
  baseURL: `${process.env.AZURE_OPENAI_ENDPOINT}/openai/deployments/${process.env.AZURE_OPENAI_MODEL}`,
  defaultQuery: { "api-version": "2024-02-15-preview" },
  defaultHeaders: {
    "api-key": process.env.AZURE_OPENAI_API_KEY,
  },
});

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
  const pngFiles = allPngFiles.slice(0, 10);

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

    return pngFiles; /* .filter(
      (file) =>
        file.includes("arrow") &&
        (file.includes("left") || file.includes("right") || file.includes("up") || file.includes("down"))
    ); // For testing */
  } catch (error) {
    console.error("Failed to read PNG directory:", error);
    return [];
  }
}

async function readIconMetadata(name: string): Promise<{ name: string; metaphor: string[] }> {
  const metadataPath = resolve(publicDir, `${name}.metadata.json`);

  try {
    const metadataContent = await readFile(metadataPath, "utf-8");
    const metadata: MetadataEntry = JSON.parse(metadataContent);

    return {
      name: metadata.name || name,
      metaphor: metadata.metaphor || [],
    };
  } catch (error) {
    console.warn(`Could not read metadata for ${name}, using filename as name`);
    return {
      name,
      metaphor: [],
    };
  }
}

async function assignEmoji(pngFilePath: string): Promise<EmojiAssignment> {
  const filename = basename(pngFilePath, ".png");

  // Read icon metadata
  const { name, metaphor } = await readIconMetadata(filename);

  const userMessage = await createUserMessage({ filename, name, metaphor }, pngDir);

  try {
    const response = await azureOpenAI.chat.completions.create(
      {
        model: process.env.AZURE_OPENAI_MODEL!,
        messages: [
          {
            role: "system",
            content: systemPrompt,
          },
          ...fewShotExamples,
          userMessage,
        ],
        max_tokens: 1000,
        temperature: 0.9,
      },
      {
        // timeout: 10000, // 10 seconds timeout
      }
    );

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
      name,
      metaphor,
      ...parsed,
      subEmoji: parsed.subEmoji || "",
    };
  } catch (error) {
    console.warn(`Failed to get AI response for ${filename}, using fallback`);
    return {
      filename,
      name: filename,
      metaphor: [],
      emoji: "n/a",
      subEmoji: "",
      alternativeEmojis: [],
      similarity: 0,
    };
  }
}

async function saveAssignments(assignments: EmojiAssignment[]): Promise<void> {
  // Sort by filename only
  const sortedAssignments = assignments.sort((a, b) => a.filename?.localeCompare(b.filename) || 0);

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
  similarity: 0.89,
};

const systemPrompt =
  systemPromptMd +
  "\n\nExample response format:\n\n" +
  "```json\n" +
  "[\n" +
  JSON.stringify(exampleResponse, null, 2) +
  "\n]" +
  "\n```";
