import { exec } from "child_process";
import { mkdirSync } from "fs";
import { readFile, readdir, rm, writeFile } from "fs/promises";
import { resolve } from "path";
import { filter, from, lastValueFrom, mergeMap, toArray } from "rxjs";
import { promisify } from "util";
import type { IconIndex, IconOption } from "../typings/icon-index";
const execAsync = promisify(exec);
const outDir = resolve("dist-icons");

main();

// TODO further compress the light index. to include size/style suffix
// Compute file name from display name
// Only support fill/regular per size

async function main() {
  const commitId = await fetchRepoAssets();
  const iconIndex = await buildIconIndex(commitId);
  await compileIconSvgs(iconIndex);
  await writeFile(resolve("public", "index.json"), JSON.stringify(iconIndex, null, 2));
  await writeFile(resolve("public", "index.min.json"), JSON.stringify(iconIndex));
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
  console.log("Fetching repository assets...");
  await execAsync(`git clone --filter=blob:none --sparse https://github.com/microsoft/fluentui-system-icons.git ${outDir}`);
  console.log("Filtering repository assets...");
  await execAsync(`cd ${outDir} && git sparse-checkout set --no-cone`);
  await execAsync(`cd ${outDir} && git sparse-checkout set 'assets/**/*.svg' 'assets/**/*.json'`);

  // Get the commit ID
  const { stdout } = await execAsync(`cd ${outDir} && git rev-parse HEAD`);
  const commitId = stdout.trim();

  console.log(`Repository assets fetched successfully. Commit: ${commitId}`);

  // remove the .git directory to clean up
  await rm(resolve(outDir, ".git"), { recursive: true });

  return commitId;
}

async function buildIconIndex(commitId: string): Promise<IconIndex> {
  const assetsDir = resolve(outDir, "assets");
  const assetFolders = await readdir(assetsDir);
  const filenamePattern = /(.+)_(\d+)_(filled|regular)\.svg/;

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
        displayName = metadata.name;
        metaphor = metadata.metaphor || [];
      } catch {
        // metadata.json doesn't exist or is invalid - skip this folder
        console.log(`Skipping folder ${folder}: no metadata.json found`);
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

        // Determine target size once: prefer 24, otherwise largest
        const uniqueSizes = [...new Set(sizes)];
        const targetSize = uniqueSizes.includes(24) ? 24 : Math.max(...uniqueSizes);

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

        console.log(`Processed icon ${++progress}/${assetFolders.length}: ${displayName}`);
      } catch (error) {
        throw new Error(`Failed to read SVG files for icon ${displayName}: ${error}`);
      }

      return { name: displayName, data: [metaphor, options] as [string[], IconOption[]] };
    }, 8),
    filter((icon) => icon !== null && icon.data[1].length > 0), // Filter out null results
    toArray()
  );

  const iconEntries = await lastValueFrom(icons$);

  return {
    commit: commitId,
    icons: Object.fromEntries(iconEntries.filter((entry) => entry !== null).map(({ name, data }) => [name, data])),
  };
}

async function compileIconSvgs(iconIndex: IconIndex) {
  // We only select a single most sensible icon size with this order:
  // First see if 24 is available, if not, select the the largest available size
  // For each style (filled, regular) under the selected size, we will convert it to a symbol inside a single svg that contains all the styles for this icon
  // e.g. if the most sensible icon size is 24:
  // Input:
  // - /dist-icons/assets/SVG/ic_fluent_add_24_filled.svg
  // - /dist-icons/assets/SVG/ic_fluent_add_24_regular.svg
  // Output:
  // - /public/add.svg#filled
  // - /public/add.svg#regular
  // Other icon sizes and styles will be ignored

  const assetsDir = resolve(outDir, "assets");
  const publicDir = resolve("public");

  // Ensure public directory exists
  // Create empty public directory if it doesn't exist
  try {
    await rm(publicDir, { recursive: true });
  } catch {}
  mkdirSync(publicDir, { recursive: true });

  let progress = 0;
  const totalIcons = Object.keys(iconIndex.icons).length;
  const icons$ = from(Object.entries(iconIndex.icons)).pipe(
    mergeMap(async ([displayName, [metaphor, options]]) => {
      // Find the most sensible size (prefer 24, otherwise largest)
      const sizes = [...new Set(options.map((opt) => opt.size))].sort((a, b) => b - a);
      const targetSize = sizes.includes(24) ? 24 : sizes[0];

      if (!targetSize) {
        progress++;
        console.log(`No valid size found for icon ${displayName}. Skipping...`);
        return;
      }

      // Get styles available for this size
      const stylesForSize = options.filter((opt) => opt.size === targetSize).map((opt) => opt.style);

      // Convert display name to code name format
      const codeNameUnderscore = displayName.toLowerCase().replace(/\s+/g, "_");
      const iconName = codeNameUnderscore.replace(/_/g, "-");

      let combinedSvg = '<svg xmlns="http://www.w3.org/2000/svg">\n';

      for (const style of stylesForSize) {
        const svgFileName = `ic_fluent_${codeNameUnderscore}_${targetSize}_${style}.svg`;
        const svgPath = resolve(assetsDir, displayName, "SVG", svgFileName);

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

      console.log(`Compiled icon ${++progress}/${totalIcons}: ${displayName} (size: ${targetSize})`);
    }, 8)
  );

  await lastValueFrom(icons$);
}
