import { readFile, writeFile } from "fs/promises";
import { resolve } from "path";
import { logInfo, logError, saveLogToFile } from "../utils/simple-build-log.js";
import { updateProgress, progressSpinner } from "../utils/progress-bar.js";

interface Assignment {
  filename: string;
  name: string;
  metaphor: string[];
  emoji: string;
  subEmoji: string;
  alternativeEmojis: string[];
  similarity: number;
}

interface EmojiAssignments {
  generated: string;
  total: number;
  assignments: Assignment[];
}

interface EmojiMapping {
  [key: string]: string;
}

interface EmojiTies {
  [key: string]: string[];
}

interface ConflictCandidate {
  filename: string;
  similarity: number;
}

async function createEmojiToIconMapping() {
  const stopSpinner = progressSpinner("Starting emoji-to-icon mapping process");
  
  try {
    // Read input file
    logInfo("Reading emoji-assignments.json file...");
    const inputPath = resolve("scripts/icon-to-emoji-llm/emoji-assignments.json");
    const inputData = await readFile(inputPath, "utf-8");
    const assignments: EmojiAssignments = JSON.parse(inputData);
    
    stopSpinner();
    logInfo(`Loaded ${assignments.total} assignments from ${assignments.generated}`);
    
    // Initialize mappings
    const emojiToIcon: EmojiMapping = {};
    const emojiTies: EmojiTies = {};
    const conflicts: { [key: string]: ConflictCandidate[] } = {};
    
    let processed = 0;
    let totalMappings = 0;
    
    // Process each assignment
    logInfo("Processing emoji assignments...");
    for (const assignment of assignments.assignments) {
      const mappings: string[] = [];
      
      // Add primary emoji mapping
      if (assignment.emoji) {
        mappings.push(assignment.emoji);
      }
      
      // Add emoji + subEmoji combination if subEmoji exists
      if (assignment.emoji && assignment.subEmoji && assignment.subEmoji.trim() !== "") {
        mappings.push(assignment.emoji + assignment.subEmoji);
      }
      
      // Process each mapping
      for (const emojiKey of mappings) {
        totalMappings++;
        
        // Check for conflicts
        if (!conflicts[emojiKey]) {
          conflicts[emojiKey] = [];
        }
        
        conflicts[emojiKey].push({
          filename: assignment.filename,
          similarity: assignment.similarity
        });
      }
      
      processed++;
      updateProgress(processed, assignments.total, "Processing assignments");
    }
    
    logInfo(`Created ${totalMappings} emoji mappings from ${assignments.total} assignments`);
    
    // Resolve conflicts and create final mappings
    logInfo("Resolving conflicts and creating final mappings...");
    let conflictCount = 0;
    let tieCount = 0;
    
    for (const [emojiKey, candidates] of Object.entries(conflicts)) {
      if (candidates.length > 1) {
        conflictCount++;
        
        // Sort by similarity score (highest first)
        candidates.sort((a, b) => b.similarity - a.similarity);
        
        // Winner is the one with highest similarity
        const winner = candidates[0];
        emojiToIcon[emojiKey] = winner.filename;
        
        // Add all candidates to ties
        emojiTies[emojiKey] = candidates.map(c => c.filename);
        tieCount++;
        
        logInfo(`Conflict resolved for ${emojiKey}: ${winner.filename} (similarity: ${winner.similarity}) beats ${candidates.length - 1} other(s)`);
      } else {
        // No conflict, simple assignment
        emojiToIcon[emojiKey] = candidates[0].filename;
      }
    }
    
    logInfo(`Resolved ${conflictCount} conflicts, created ${tieCount} tie records`);
    
    // Write output files
    logInfo("Writing output files...");
    const outputDir = "scripts/icon-to-emoji-llm";
    
    const emojiToIconPath = resolve(outputDir, "emoji-to-icon.json");
    const emojiTiesPath = resolve(outputDir, "emoji-ties.json");
    
    const emojiToIconData = {
      generated: new Date().toISOString(),
      totalMappings: Object.keys(emojiToIcon).length,
      mappings: emojiToIcon
    };
    
    const emojiTiesData = {
      generated: new Date().toISOString(),
      totalTies: Object.keys(emojiTies).length,
      ties: emojiTies
    };
    
    await writeFile(emojiToIconPath, JSON.stringify(emojiToIconData, null, 2), "utf-8");
    await writeFile(emojiTiesPath, JSON.stringify(emojiTiesData, null, 2), "utf-8");
    
    logInfo(`✅ emoji-to-icon.json created with ${Object.keys(emojiToIcon).length} mappings`);
    logInfo(`✅ emoji-ties.json created with ${Object.keys(emojiTies).length} tie records`);
    
    // Summary
    logInfo("=== SUMMARY ===");
    logInfo(`Total assignments processed: ${assignments.total}`);
    logInfo(`Total emoji mappings created: ${totalMappings}`);
    logInfo(`Conflicts resolved: ${conflictCount}`);
    logInfo(`Final emoji-to-icon mappings: ${Object.keys(emojiToIcon).length}`);
    logInfo(`Emoji ties recorded: ${Object.keys(emojiTies).length}`);
    logInfo("=== END SUMMARY ===");
    
  } catch (error) {
    stopSpinner();
    logError("Failed to create emoji-to-icon mapping", error);
    throw error;
  }
}

// Run the script
async function main() {
  try {
    await createEmojiToIconMapping();
    await saveLogToFile("emoji-mapping");
    process.exit(0);
  } catch (error) {
    logError("Script failed", error);
    await saveLogToFile("emoji-mapping");
    process.exit(1);
  }
}

main();