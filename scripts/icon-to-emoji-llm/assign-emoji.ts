import { readdir, readFile, writeFile } from "fs/promises";
import { resolve, extname, basename } from "path";
import { existsSync, readFileSync } from "fs";
import { config } from "dotenv";
import { OpenAI } from "openai";
import { from, mergeMap, lastValueFrom } from "rxjs";
import { updateProgress } from "../utils/progress-bar";
import type { MetadataEntry } from "../../typings/icon-index";
import { createFewShotExamples, createUserMessage } from "./create-examples";
import type { EmojiAssignmentResponse, EmojiAssignment } from "./types";
import { groupIconSets } from "./group-icon-sets";

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

  // Group icons by the first word of their filename
  const allIconGroups = groupIconSets(allPngFiles);

  // TEMP: Limit to first 5 groups for testing
  const iconGroups = allIconGroups.slice(0, 1);
  const totalIcons = iconGroups.flat().length;

  console.log(`Found ${allPngFiles.length} PNG files total, grouped into ${allIconGroups.length} groups`);
  console.log(`Processing first ${iconGroups.length} groups (${totalIcons} icons) (TEMP LIMIT)`);

  let progress = 0;
  let errors = 0;
  const assignments: EmojiAssignment[] = [];

  const analysis$ = from(iconGroups).pipe(
    mergeMap(async (iconGroup) => {
      try {
        const groupAssignments = await assignEmojiToIcons(iconGroup);
        assignments.push(...groupAssignments);
        progress += iconGroup.length;
      } catch (error) {
        console.error(`Failed to assign emojis for group ${iconGroup[0]}:`, error);
        errors += iconGroup.length;
        progress += iconGroup.length;
      }
      updateProgress(progress, totalIcons, "Analyzing icon groups for emoji assignment", errors);
    }, 2) // Process 2 groups concurrently to avoid rate limits
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

async function assignEmojiToIcons(iconGroup: string[]): Promise<EmojiAssignment[]> {
  // Create user messages for each icon in the group
  const userMessages = [];
  const iconMetadata: { filename: string; name: string; metaphor: string[] }[] = [];

  for (const pngFilePath of iconGroup) {
    const filename = basename(pngFilePath, ".png");
    const { name, metaphor } = await readIconMetadata(filename);

    iconMetadata.push({ filename, name, metaphor });
    const userMessage = await createUserMessage({ filename, name, metaphor }, pngDir);
    userMessages.push(userMessage);
  }

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
          ...userMessages,
        ],
        max_tokens: 2000, // Increased for multiple icons
        temperature: 0.9,
      },
      {
        timeout: 30000, // 30 seconds timeout for groups
      }
    );

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error("No response content received");
    }

    // Parse the JSON response - expecting an array of assignments
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      throw new Error("No JSON array found in response");
    }

    const parsed = JSON.parse(jsonMatch[0]) as EmojiAssignmentResponse[];

    if (parsed.length !== userMessages.length) {
      throw new Error(
        `Parsed response length (${parsed.length}) does not match user message length (${userMessages.length})`
      );
    }

    // Combine the parsed responses with metadata
    return parsed.map((assignment, index) => ({
      ...iconMetadata[index],
      ...assignment,
      subEmoji: assignment.subEmoji || "",
    }));
  } catch (error) {
    console.warn(`Failed to get AI response for group, using fallback`);
    // Return fallback assignments for all icons in the group
    return iconMetadata.map((meta) => ({
      ...meta,
      emoji: "n/a",
      subEmoji: "",
      alternativeEmojis: [],
      similarity: 0,
    }));
  }
}

async function getPngFiles(): Promise<string[]> {
  try {
    const files = await readdir(pngDir);
    return files.filter((file) => extname(file) === ".png").map((file) => resolve(pngDir, file));
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
