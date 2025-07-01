import { writeFile } from "fs/promises";
import { basename, resolve } from "path";

export function groupIconSets(pngFiles: string[], maxGroupSize: number = 20, minSubgroupSize: number = 4): string[][] {
  // Step 1: Group by first word
  const firstWordGroups = new Map<string, string[]>();
  for (const pngFile of pngFiles) {
    const filename = basename(pngFile, ".png");
    const firstWord = filename.split(/[-_]/)[0].toLowerCase();
    if (!firstWordGroups.has(firstWord)) {
      firstWordGroups.set(firstWord, []);
    }
    firstWordGroups.get(firstWord)!.push(pngFile);
  }

  const finalGroups: string[][] = [];

  for (const group of firstWordGroups.values()) {
    if (group.length > maxGroupSize) {
      // Step 2: Subgroup by second word, with special case for "up", "down", "left", "right", "bidirectional"
      const directionWords = new Set(["up", "down", "left", "right", "bidirectional"]);
      const secondWordGroups = new Map<string, string[]>();
      for (const pngFile of group) {
        const filename = basename(pngFile, ".png");
        const parts = filename.split(/[-_]/);
        let secondWord = parts[1] ? parts[1].toLowerCase() : "__none__";
        // Special case: treat "up", "down", "left", "right" as the same group
        if (directionWords.has(secondWord)) {
          secondWord = "__direction__";
        }
        if (!secondWordGroups.has(secondWord)) {
          secondWordGroups.set(secondWord, []);
        }
        secondWordGroups.get(secondWord)!.push(pngFile);
      }

      // Step 3: Collect small subgroups into extrasGroup
      const extrasGroup: string[] = [];
      for (const subgroup of secondWordGroups.values()) {
        if (subgroup.length < minSubgroupSize) {
          extrasGroup.push(...subgroup);
        } else {
          finalGroups.push(subgroup);
        }
      }
      if (extrasGroup.length > 0) {
        finalGroups.push(extrasGroup);
      }
    } else {
      finalGroups.push(group);
    }
  }
  
  // Save finalGroups to a JSON file, only including the filenames (no paths)
  const finalGroupsFilenames = finalGroups.map(group =>
    group.map(pngFile => basename(pngFile, ".png"))
  );
  writeFile (
    resolve("scripts", "build-logs", "icon-groups.json"),
    JSON.stringify(finalGroupsFilenames, null, 2),
    "utf-8"
  );
  return finalGroups;
}