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
  console.log("🚀 Starting icon build process...\n");
  
  console.log("📥 Fetching repository assets...");
  const commitId = await fetchRepoAssets();
  // const commitId = "1234567890"; // to test locally
  
  console.log("🔍 Building icon index...");
  const { iconIndex, metadata, iconDirMap } = await buildIconIndex(commitId);
  
  console.log("⚙️  Compiling icon SVGs...");
  await compileIconSvgs(iconIndex, metadata, iconDirMap);
  
  console.log("💾 Creating index files...");
  await Promise.all([
    writeFile(resolve("public", "index.json"), JSON.stringify(iconIndex, null, 2)),
    writeFile(resolve("public", "index.min.json"), JSON.stringify(iconIndex)),
    createCsvIndex(iconIndex),
  ]);
  
  console.log("📄 Saving metadata files...");
  await saveMetadata(metadata);
  
  console.log("\n✅ Build process completed successfully!");
}

async function fetchRepoAssets(): Promise<string> {
  // download the entire folder content from https://github.com/microsoft/fluentui-system-icons/tree/main/assets
  // save them to outDir/fluentui-system-icons/assets

  // Create temp directory if it doesn't exist
  try {
    await rm(outDir, { recursive: true });
  } catch {}

  await mkdirSync(outDir, { recursive: true });

  // Clone the repository with sparse checkout to get only the assets folder
  await execAsync(
    `git clone --filter=blob:none --sparse https://github.com/microsoft/fluentui-system-icons.git ${outDir}`
  );
  await execAsync(`cd ${outDir} && git sparse-checkout init --cone`);
  await execAsync(`cd ${outDir} && git sparse-checkout set assets`);

  // Get the commit ID
  const { stdout } = await execAsync(`cd ${outDir} && git rev-parse HEAD`);
  const commitId = stdout.trim();

  console.log(`✅ Repository assets fetched successfully. Commit: ${commitId}`);

  // remove the .git directory to clean up
  await rm(resolve(outDir, ".git"), { recursive: true });

  return commitId;
}

async function buildIconIndex(commitId: string): Promise<{
  iconIndex: IconIndex;
  metadata: Record<string, { options: IconOption[] }>;
  iconDirMap: Map<string, string>;
}> {
  const assetsDir = resolve(outDir, "assets");
  const assetFolders = await readdir(assetsDir);
  const filenamePattern = /(.+)_(\d+)_(filled|regular)\.svg/;
  const metadataMap = new Map<string, { name: string; options: IconOption[] }>();
  // Given an icon's display name, what is the full path of the dir that contains the metadata.json?
  const iconDirMap = new Map<string, string>();

  let progress = 0;
  let errors = 0;

  const icons$ = from(assetFolders).pipe(
    mergeMap(async (folder) => {
      const folderPath = resolve(assetsDir, folder);

      // DEV: Only process icons starting with "a" for faster testing
      // if (!folder.toLowerCase().startsWith("a")) {
      //   return null;
      // }

      // First, scan SVG files to get actual available options
      let actualOptions: IconOption[] = [];
      try {
        const svgDir = resolve(folderPath, "SVG");
        const svgFiles = await readdir(svgDir);

        actualOptions = svgFiles
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

        // If no valid SVG files found, skip this folder
        if (actualOptions.length === 0) {
          // // console.warn(`Skipping folder ${folder}: no valid SVG files found`);
          errors++;
          updateProgress(++progress, assetFolders.length, "Processing icons", errors);
          return null;
        }
      } catch (error) {
        // // console.warn(`Skipping folder ${folder}: cannot read SVG directory - ${error}`);
        errors++;
        updateProgress(++progress, assetFolders.length, "Processing icons", errors);
        return null;
      }

      // Now read or create metadata.json
      let displayName = folder;
      let metaphor: string[] = [];
      const metadataPath = resolve(folderPath, "metadata.json");

      try {
        const metadataContent = await readFile(metadataPath, "utf-8");
        const metadata = JSON.parse(metadataContent);
        displayName = metadata.name?.replace(/\s+/g, " ").trim() || folder; // Normalize display name
        metaphor = metadata.metaphor || [];
      } catch {
        // metadata.json doesn't exist or is invalid - we'll create it
        // console.warn(`Creating metadata for folder ${folder}: no valid metadata.json found`);
      }

      // Create/update metadata with actual SVG options
      const updatedMetadata = {
        name: displayName,
        metaphor: metaphor,
        options: actualOptions,
      };

      // Write back the corrected metadata.json
      try {
        await writeFile(metadataPath, JSON.stringify(updatedMetadata, null, 2), "utf-8");
      } catch (error) {
        // // console.warn(`Failed to write metadata for ${folder}: ${error}`);
        errors++;
      }

      // Map display name to its directory path
      iconDirMap.set(displayName, folderPath);

      // Process options for the index (target size only)
      const sizes = actualOptions.map((opt) => opt.size);
      const targetSize = getMostSensibleIconSize(sizes);

      const targetOptions: IconOption[] = actualOptions
        .filter((opt) => opt.size === targetSize)
        .sort((a, b) => {
          if (a.style === "regular" && b.style === "filled") return -1;
          return 0;
        });

      metadataMap.set(displayName, { name: displayName, options: actualOptions });

      const allSizes = [...new Set(actualOptions.map((opt) => opt.size))];
      updateProgress(++progress, assetFolders.length, "Processing icons", errors);

      return { name: displayName, data: [metaphor, targetOptions, allSizes] as [string[], IconOption[], number[]] };
    }, 8),
    filter((icon) => icon !== null && icon.data[1].length > 0), // Filter out null results
    toArray()
  );

  const iconEntries = await lastValueFrom(icons$);

  return {
    iconIndex: {
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

  // console.log(JSON.stringify(iconIndex, null, 2));

  const publicDir = resolve("public");

  // Ensure public directory exists
  // Create empty public directory if it doesn't exist
  try {
    await rm(publicDir, { recursive: true });
  } catch {}
  mkdirSync(publicDir, { recursive: true });

  let progress = 0;
  let errors = 0;
  let sizeFrequency: { allSizes: Record<number, number>; targetSize: Record<number, number>; total: number } = {
    allSizes: {},
    targetSize: {},
    total: 0,
  };
  const totalIcons = Object.keys(iconIndex.icons).length;
  const icons$ = from(Object.entries(iconIndex.icons)).pipe(
    mergeMap(async ([displayName, [_metaphor, options]]) => {
      const targetSize = getMostSensibleIconSize(options.map((opt) => opt.size));

      if (!targetSize) {
        updateProgress(++progress, totalIcons, "Compiling SVGs", errors);
        return;
      }

      // Get styles available for this size
      const stylesForSize = options.filter((opt) => opt.size === targetSize).map((opt) => opt.style);

      const codeNameUnderscore = displayNameToSourceAssetSVGFilename(displayName);
      const iconName = displayNameToVibeIconSVGFilename(displayName);

      let combinedSvg = '<svg xmlns="http://www.w3.org/2000/svg">\n';

      if (!iconDirMap.has(displayName)) {
        // console.warn(`Icon directory not found for ${displayName}`);
        errors++;
        updateProgress(++progress, totalIcons, "Compiling SVGs", errors);
        return;
      }

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
          // console.warn(`Failed to read ${svgFileName}: ${error}`);
          errors++;
        }
      }

      combinedSvg += "</svg>";

      // Write the combined SVG file
      const outputPath = resolve(publicDir, `${iconName}.svg`);
      try {
        await writeFile(outputPath, combinedSvg, "utf-8");
      } catch (error) {
        // console.warn(`Failed to write combined SVG for ${displayName}: ${error}`);
        errors++;
      }

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
            sizeFrequency.allSizes[size] ??= 0;
            sizeFrequency.allSizes[size]++;
          } catch (error) {
            // console.warn(`Failed to process ${svgFileName}: ${error}`);
            errors++;
          }
        }
      }

      updateProgress(++progress, totalIcons, "Compiling SVGs", errors);
      sizeFrequency.targetSize[targetSize] ??= 0;
      sizeFrequency.targetSize[targetSize]++;
      sizeFrequency.total++;
    }, 8)
  );

  await lastValueFrom(icons$);

  console.log(`Size stats:\n${JSON.stringify(sizeFrequency, null, 2)}`);
}

async function createCsvIndex(iconIndex: IconIndex) {
  let csvContent = "Name,Metaphors\n";

  for (const [displayName, [metaphors, _]] of Object.entries(iconIndex.icons)) {
    // Escape the display name if it contains commas or quotes
    const escapedName =
      displayName.includes(",") || displayName.includes('"') ? `"${displayName.replace(/"/g, '""')}"` : displayName;

    // Join metaphors with comma and escape if necessary
    // Replace multi space or new lines with a single space
    const metaphorString = metaphors.join(",").replace(/\s+/g, " ").trim();

    const escapedMetaphors =
      metaphorString.includes(",") || metaphorString.includes('"')
        ? `"${metaphorString.replace(/"/g, '""')}"`
        : metaphorString;

    csvContent += `${escapedName},${escapedMetaphors}\n`;
  }

  await writeFile(resolve("public", "index.csv"), csvContent);
  console.log("✅ CSV index created successfully");
}

async function saveMetadata(metadata: MetadataMap) {
  // render each meatadata entry to <public>/<icon-name>.metadata.json
  const publicDir = resolve("public");
  await mkdirSync(publicDir, { recursive: true });
  const totalMetadata = Object.entries(metadata).length;
  let progress = 0;
  let errors = 0;

  const metadata$ = from(Object.entries(metadata)).pipe(
    mergeMap(async ([name, { options }]) => {
      const fileName = displayNameToVibeIconSVGFilename(name);
      const filePath = resolve(publicDir, `${fileName}.metadata.json`);
      try {
        await writeFile(filePath, JSON.stringify({ name, options }, null, 2), "utf-8");
      } catch (error) {
        // console.warn(`Failed to save metadata for ${name}: ${error}`);
        errors++;
      }
      updateProgress(++progress, totalMetadata, "Saving metadata", errors);
    }, 8)
  );

  await lastValueFrom(metadata$);
}

// Simple progress bar function
function updateProgress(current: number, total: number, stage: string, errors: number = 0) {
  const percentage = Math.round((current / total) * 100);
  const barLength = 30;
  const filledLength = Math.round((barLength * current) / total);
  const bar = '█'.repeat(filledLength) + '░'.repeat(barLength - filledLength);
  
  const errorText = errors > 0 ? ` | ${errors} errors` : '';
  process.stdout.write(`\r${stage}: [${bar}] ${percentage}% (${current}/${total})${errorText}`);
  if (current === total) {
    process.stdout.write('\n');
  }
}