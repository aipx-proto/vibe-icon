import { exec } from "child_process";
import { mkdirSync } from "fs";
import { readFile, readdir, rm, writeFile } from "fs/promises";
import { resolve } from "path";
import { filter, from, lastValueFrom, mergeMap, toArray } from "rxjs";
import { promisify } from "util";
import type { IconIndex, IconOption, MetadataMap } from "../typings/icon-index";
import { getMostSensibleIconSize } from "./get-sensible-size";
import { displayNameToSourceAssetSVGFilename, displayNameToVibeIconSVGFilename } from "./normalize-name";
const execAsync = promisify(exec);
const outDir = resolve("dist-icons");

main();

// TODO further compress the light index. to include size/style suffix
// Compute file name from display name
// Only support fill/regular per size

async function main() {
  const commitId = await fetchRepoAssets();
  const { index: iconIndex, metadata, iconDirMap } = await buildIconIndex(commitId);
  await compileIconSvgs(iconIndex, metadata, iconDirMap);
  await Promise.all([
    writeFile(resolve("public", "index.json"), JSON.stringify(iconIndex, null, 2)),
    writeFile(resolve("public", "index.min.json"), JSON.stringify(iconIndex)),
    createCsvIndex(iconIndex),
  ]);
  await saveMetadata(metadata);
}

async function fetchRepoAssets(): Promise<string> {
  // download the entire folder content from https://github.com/microsoft/fluentui-system-icons/tree/main/assets
  // save them to outDir/fluentui-system-icons/assets

  // Create temp directory if it doesn't exist
  try {
    await rm(outDir, { recursive: true });
    console.log("✓ Removed existing dist-icons directory");
  } catch {
    console.log("✓ No existing dist-icons directory to remove");
  }

  await mkdirSync(outDir, { recursive: true });
  console.log("✓ Created dist-icons directory");

  // Clone the repository with sparse checkout to get only the assets folder
  console.log("Fetching repository assets...");
  await execAsync(`git clone --filter=blob:none --sparse https://github.com/microsoft/fluentui-system-icons.git ${outDir}`);
  console.log("✓ Git clone completed");

  // Check what's in the directory after clone
  try {
    const clonedContents = await readdir(outDir);
    console.log(`✓ Contents after clone: ${clonedContents.join(', ')}`);
  } catch (error) {
    console.log(`✗ Error reading cloned directory: ${error}`);
  }

  console.log("Filtering repository assets...");
  await execAsync(`cd ${outDir} && git sparse-checkout init --cone`);
  console.log("✓ Sparse checkout initialized");
  
  await execAsync(`cd ${outDir} && git sparse-checkout set assets`);
  console.log("✓ Sparse checkout patterns set");

  // Check what's in the directory after sparse checkout
  try {
    const contentsAfterSparse = await readdir(outDir);
    console.log(`✓ Contents after sparse checkout: ${contentsAfterSparse.join(', ')}`);
    
    // Check if assets directory exists
    const assetsPath = resolve(outDir, "assets");
    try {
      const assetsContents = await readdir(assetsPath);
      console.log(`✓ Assets directory found with ${assetsContents.length} items`);
      console.log(`✓ First few assets: ${assetsContents.slice(0, 5).join(', ')}`);
    } catch (assetsError) {
      console.log(`✗ Assets directory not found: ${assetsError}`);
    }
  } catch (error) {
    console.log(`✗ Error reading directory after sparse checkout: ${error}`);
  }

  // Get the commit ID
  const { stdout } = await execAsync(`cd ${outDir} && git rev-parse HEAD`);
  const commitId = stdout.trim();

  console.log(`Repository assets fetched successfully. Commit: ${commitId}`);

  // remove the .git directory to clean up
  await rm(resolve(outDir, ".git"), { recursive: true });
  console.log("✓ Cleaned up .git directory");

  return commitId;
}

async function buildIconIndex(
  commitId: string
): Promise<{ index: IconIndex; metadata: Record<string, { options: IconOption[] }>; iconDirMap: Map<string, string> }> {
  const assetsDir = resolve(outDir, "assets");
  console.log(`📁 Attempting to read assets directory: ${assetsDir}`);
  
  // Debug: Check if the directory exists and what's in the parent directory
  try {
    const parentDir = resolve(outDir);
    const parentContents = await readdir(parentDir);
    console.log(`📁 Parent directory (${parentDir}) contents: ${parentContents.join(', ')}`);
  } catch (error) {
    console.log(`✗ Error reading parent directory: ${error}`);
  }
  
  const assetFolders = await readdir(assetsDir);
  const filenamePattern = /(.+)_(\d+)_(filled|regular)\.svg/;
  const metadataMap = new Map<string, { name: string; options: IconOption[] }>();
  // Given an icon's display name, what is the full path of the dir that contains the metadata.json?
  const iconDirMap = new Map<string, string>();

  let progress = 0;

  const icons$ = from(assetFolders).pipe(
    mergeMap(async (folder) => {
      const folderPath = resolve(assetsDir, folder);
      let displayName = folder;
      let metaphor: string[] = [];

      // Try to read metadata.json
      try {
        const metadataPath = resolve(folderPath, "metadata.json");
        const metadataContent = await readFile(metadataPath, "utf-8");
        const metadata = JSON.parse(metadataContent);
        displayName = metadata.name.replace(/\s+/g, " ").trim(); // Normalize display name
        metaphor = metadata.metaphor || [];

        // Map display name to its directory path
        iconDirMap.set(displayName, folderPath);
      } catch {
        // metadata.json doesn't exist or is invalid - skip this folder
        // console.log(`Skipping folder ${folder}: no metadata.json found`);
        return null;
      }

      // Collect and parse SVG files
      const options: IconOption[] = [];
      try {
        const svgDir = resolve(folderPath, "SVG");
        const svgFiles = await readdir(svgDir);

        const sizes = svgFiles
          .filter((file) => file.endsWith(".svg"))
          .map((file) => {
            const match = file.match(filenamePattern);
            return match ? parseInt(match[2]) : null;
          })
          .filter((size): size is number => size !== null);

        const targetSize = getMostSensibleIconSize(sizes);

        const allOptions: IconOption[] = svgFiles
          .filter((file) => file.endsWith(".svg"))
          .map((file) => {
            const match = file.match(filenamePattern);
            if (match) {
              const [_, __, size, style] = match;
              return { size: parseInt(size), style };
            }
            return null;
          })
          .filter((opt): opt is IconOption => opt !== null);
        metadataMap.set(displayName, { name: displayName, options: allOptions });

        svgFiles
          .filter((file) => file.endsWith(".svg"))
          .forEach((file) => {
            const match = file.match(filenamePattern);
            if (match) {
              const [_, __, size, style] = match;
              const sizeNum = parseInt(size);

              // Only include options for the target size
              if (sizeNum === targetSize) {
                options.push({ size: sizeNum, style });
              }
            }
          });

        // sort the styles, regular first, then filled
        options.sort((a, b) => {
          if (a.style === "regular" && b.style === "filled") return -1;
          return 0;
        });

        // console.log(`Processed icon ${++progress}/${assetFolders.length}: ${displayName}`);
      } catch (error) {
        throw new Error(`Failed to read SVG files for icon ${displayName}: ${error}`);
      }

      const allSizes = [...new Set(metadataMap.get(displayName)?.options.map((opt) => opt.size) || [])];
      return { name: displayName, data: [metaphor, options, allSizes] as [string[], IconOption[], number[]] };
    }, 8),
    filter((icon) => icon !== null && icon.data[1].length > 0), // Filter out null results
    toArray()
  );

  const iconEntries = await lastValueFrom(icons$);

  return {
    index: {
      commit: commitId,
      icons: Object.fromEntries(
        iconEntries
          .filter((entry) => entry !== null)
          .map(({ name, data }) => {
            return [name, data];
          })
      ),
    },
    metadata: Object.fromEntries(Array.from(metadataMap.entries()).map(([name, { options }]) => [name, { options }])),
    iconDirMap,
  };
}

async function compileIconSvgs(iconIndex: IconIndex, metadata: MetadataMap, iconDirMap: Map<string, string>) {
  // We only select a single most sensible icon size with this order:
  // For each style (filled, regular) under the selected size, we will convert it to a symbol inside a single svg that contains all the styles for this icon
  // e.g. if the most sensible icon size is 20:
  // Input:
  // - /dist-icons/assets/Add Circle/SVG/ic_fluent_add_circle_20_filled.svg
  // - /dist-icons/assets/Add Circle/SVG/ic_fluent_add_circle_20_regular.svg
  // Sensible icon size output:
  // - /public/add_circle.svg#filled
  // - /public/add_circle.svg#regular
  // Full output:
  // - /public/add_circle_20_filled.svg
  // - /public/add_circle_20_regular.svg
  // - /public/add_circle_24_filled.svg
  // - /public/add_circle_24_regular.svg

  const publicDir = resolve("public");

  // Ensure public directory exists
  // Create empty public directory if it doesn't exist
  try {
    await rm(publicDir, { recursive: true });
  } catch {}
  mkdirSync(publicDir, { recursive: true });

  let progress = 0;
  let sizeFrequency: Record<number, number> = {};
  const totalIcons = Object.keys(iconIndex.icons).length;
  const icons$ = from(Object.entries(iconIndex.icons)).pipe(
    mergeMap(async ([displayName, [_metaphor, options]]) => {
      const targetSize = getMostSensibleIconSize(options.map((opt) => opt.size));

      if (!targetSize) {
        progress++;
        console.log(`No valid size found for icon ${displayName}. Skipping...`);
        return;
      }

      // Get styles available for this size
      const stylesForSize = options.filter((opt) => opt.size === targetSize).map((opt) => opt.style);

      const codeNameUnderscore = displayNameToSourceAssetSVGFilename(displayName);
      const iconName = displayNameToVibeIconSVGFilename(displayName);

      let combinedSvg = '<svg xmlns="http://www.w3.org/2000/svg">\n';

      if (!iconDirMap.has(displayName)) throw new Error(`Icon directory not found for ${displayName}`);

      for (const style of stylesForSize) {
        const svgFileName = `ic_fluent_${codeNameUnderscore}_${targetSize}_${style}.svg`;
        // We must use iconDirMap to determine the folder that contains the SVG files
        // There is NO guarantee that the icon name matches the folder name, for example "USB Stick" icons are in "Usb Stick" folder.
        const svgPath = resolve(iconDirMap.get(displayName)!, "SVG", svgFileName);

        try {
          let content = await readFile(svgPath, "utf-8");

          // Extract the inner content of the SVG
          const pathMatch = content.match(/<svg[^>]*>([\s\S]*)<\/svg>/);
          if (pathMatch) {
            // replace fill="#\d+" with fill="currentColor"
            const webSvg = pathMatch[1].replaceAll(/fill="#\d+"/g, 'fill="currentColor"').trim();

            combinedSvg += `  <symbol id="${style}" viewBox="0 0 ${targetSize} ${targetSize}">\n`;
            combinedSvg += `    ${webSvg}\n`;
            combinedSvg += `  </symbol>\n`;
          }
        } catch (error) {
          console.error(`Failed to read ${svgFileName}: ${error}`);
        }
      }

      combinedSvg += "</svg>";

      // Write the combined SVG file
      const outputPath = resolve(publicDir, `${iconName}.svg`);
      await writeFile(outputPath, combinedSvg, "utf-8");

      // Generate full output for all available sizes and styles
      if (metadata[displayName]) {
        const allOptions = metadata[displayName].options;

        for (const { size, style } of allOptions) {
          const svgFileName = `ic_fluent_${codeNameUnderscore}_${size}_${style}.svg`;
          const svgPath = resolve(iconDirMap.get(displayName)!, "SVG", svgFileName);
          const outputFileName = `${iconName}-${size}-${style}.svg`;
          const outputFilePath = resolve(publicDir, outputFileName);

          try {
            let content = await readFile(svgPath, "utf-8");

            // Replace fill colors with currentColor for web usage
            content = content.replaceAll(/fill="#\d+"/g, 'fill="currentColor"');

            await writeFile(outputFilePath, content, "utf-8");
          } catch (error) {
            console.error(`Failed to process ${svgFileName}: ${error}`);
          }
        }
      }

      // console.log(`Compiled icon ${++progress}/${totalIcons}: ${displayName} (size: ${targetSize})`);
      sizeFrequency[targetSize] ??= 0;
      sizeFrequency[targetSize]++;
    }, 8)
  );

  await lastValueFrom(icons$);

  console.log(`Size stats:\n${JSON.stringify(sizeFrequency, null, 2)}`);
}

async function createCsvIndex(iconIndex: IconIndex) {
  let csvContent = "Name,Metaphors\n";

  for (const [displayName, [metaphors, _]] of Object.entries(iconIndex.icons)) {
    // Escape the display name if it contains commas or quotes
    const escapedName = displayName.includes(",") || displayName.includes('"') ? `"${displayName.replace(/"/g, '""')}"` : displayName;

    // Join metaphors with comma and escape if necessary
    // Replace multi space or new lines with a single space
    const metaphorString = metaphors.join(",").replace(/\s+/g, " ").trim();

    const escapedMetaphors = metaphorString.includes(",") || metaphorString.includes('"') ? `"${metaphorString.replace(/"/g, '""')}"` : metaphorString;

    csvContent += `${escapedName},${escapedMetaphors}\n`;
  }

  await writeFile(resolve("public", "index.csv"), csvContent);
  console.log("CSV index created successfully");
}

async function saveMetadata(metadata: MetadataMap) {
  // render each meatadata entry to <public>/<icon-name>.metadata.json
  const publicDir = resolve("public");
  await mkdirSync(publicDir, { recursive: true });
  const totalMetadata = Object.entries(metadata).length;
  let progress = 0;

  const metadata$ = from(Object.entries(metadata)).pipe(
    mergeMap(async ([name, { options }]) => {
      const fileName = displayNameToVibeIconSVGFilename(name);
      const filePath = resolve(publicDir, `${fileName}.metadata.json`);
      await writeFile(filePath, JSON.stringify({ name, options }, null, 2), "utf-8");
      // console.log(`Metadata saved ${++progress}/${totalMetadata}: ${name}`);
    }, 8)
  );

  await lastValueFrom(metadata$);
}
