import { exec } from "child_process";
import { mkdirSync } from "fs";
import { readFile, readdir, rm, writeFile } from "fs/promises";
import { resolve } from "path";
import { from, lastValueFrom, mergeMap, toArray } from "rxjs";
import { promisify } from "util";
import type { IconIndex } from "../typings/icon-index";
const execAsync = promisify(exec);
const outDir = resolve("dist-icons");

main();

// TODO further compress the light index. to include size/style suffix
// Compute file name from display name
// Only support fill/regular per size

async function main() {
  const commitId = await fetchRepoAssets();
  const icons = await buildIndex();
  const index: Index = {
    commit: commitId,
    icons: icons,
  };
  await writeFile(resolve(outDir, "index.json"), JSON.stringify(index, null, 2), "utf-8");

  const lightIndex = await getLightIndex(icons, commitId);
  await writeFile(resolve(outDir, "index.min.json"), JSON.stringify(lightIndex));

  await moveAssetsToPublic();
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

interface Index {
  commit: string;
  icons: IndexIcon[];
}

interface IndexIcon {
  name: string;
  metaphor: string[];
  files: string[];
}

async function buildIndex(): Promise<IndexIcon[]> {
  const assetsDir = resolve(outDir, "assets");
  const assetFolders = await readdir(assetsDir);

  const icons: IndexIcon[] = [];

  let progress = 0;

  const icons$ = from(assetFolders).pipe(
    mergeMap(async (folder) => {
      const folderPath = resolve(assetsDir, folder);
      const icon: IndexIcon = {
        name: folder,
        metaphor: [],
        files: [],
      };

      // Try to read metadata.json
      try {
        const metadataPath = resolve(folderPath, "metadata.json");
        const metadataContent = await readFile(metadataPath, "utf-8");
        const metadata = JSON.parse(metadataContent);

        icon.name = metadata.name;
        icon.metaphor = metadata.metaphor || [];
      } catch (error) {
        // metadata.json doesn't exist or is invalid
      }

      // Collect SVG files
      try {
        const svgDir = resolve(folderPath, "SVG");
        const svgFiles = await readdir(svgDir);
        icon.files = svgFiles.filter((file) => file.endsWith(".svg"));

        // concurrently replace the `fill="#212121"` with `fill="currentColor"` in each SVG file
        await Promise.all(
          icon.files.map(async (file) => {
            const filePath = resolve(svgDir, file);
            let content = await readFile(filePath, "utf-8");
            content = content.replace(/fill="#212121"/g, 'fill="currentColor"');
            await writeFile(filePath, content, "utf-8");
          })
        );
        console.log(`Processed icon ${++progress}/${assetFolders.length}: ${icon.name}`);
      } catch (error) {
        throw new Error(`Failed to read SVG files for icon ${icon.name}: ${error}`);
        // SVG directory doesn't exist
      }

      // Write icon.json to the asset folder
      const iconJsonPath = resolve(folderPath, "icon.json");
      await writeFile(iconJsonPath, JSON.stringify(icon, null, 2), "utf-8");

      return icon;
    }, 8),
    toArray()
  );

  icons.push(...(await lastValueFrom(icons$)));

  return icons;
}

function transformSVG(code: string): string {
  // Replace fill="#212121" with fill="currentColor"
  /**
   * Convert the SVG to be a symbol, e.g.
   * From:
   * <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#212121">
   * To:
   * <symbol id="icon-name" viewBox="0 0 24 24" fill="currentColor">
   */

  return code;
}

async function getLightIndex(indexIcons: IndexIcon[], commitId: string): Promise<IconIndex> {
  // filename pattern is /.+_(\d+)_(filled|regular).svg/
  // parse into capture into weight and style

  const filenamePattern = /(.+)_(\d+)_(filled|regular)\.svg/;

  return {
    commit: commitId,
    icons: Object.fromEntries(
      indexIcons.map((icon) => [
        icon.name,
        [
          icon.metaphor,
          icon.files
            .map((file) => {
              const match = file.match(filenamePattern);
              if (match) {
                const [_, __, size, style] = match;
                return `${size}_${style}`;
              } else {
                return null;
              }
            })
            .filter((option) => option !== null),
        ] as const,
      ])
    ),
  };
}

async function moveAssetsToPublic() {
  // Move assets from outDir to public. Concurrently process each icon folder. Use glob
  // Input path: /dist-icons/assets/<icon_display_name>/SVG/ic_fluent_<icon_code_name>_<weight(digits)>_<style>.svg
  // Output path: /public/<icon-code-name>/<weight>/<style>.svg

  const assetsDir = resolve(outDir, "assets");
  const publicDir = resolve("public");
  const iconFolders = await readdir(assetsDir);

  // Create empty public directory if it doesn't exist
  try {
    await rm(publicDir, { recursive: true });
  } catch {}
  mkdirSync(publicDir, { recursive: true });

  await buildCombinedIndex();

  let progress = 0;
  const processFiles$ = from(iconFolders).pipe(
    mergeMap(async (folder) => {
      const svgDir = resolve(assetsDir, folder, "SVG");

      try {
        const svgFiles = await readdir(svgDir);

        await Promise.all(
          svgFiles
            .filter((file) => file.endsWith(".svg"))
            .map(async (file) => {
              const match = file.match(/ic_fluent_(.+)_(\d+)_(filled|regular)\.svg/);
              if (match) {
                const [_, iconCodeName, weight, style] = match;
                const iconName = iconCodeName.replace(/_/g, "-").toLowerCase(); // Convert to kebab-case
                const targetDir = resolve(publicDir, iconName, weight);
                const targetFile = resolve(targetDir, `${style}.svg`);

                await mkdirSync(targetDir, { recursive: true });
                const sourceFile = resolve(svgDir, file);
                const content = await readFile(sourceFile, "utf-8");
                await writeFile(targetFile, content, "utf-8");
              }
            })
        );
        console.log(`Transform folder structure ${++progress}/${iconFolders.length}`);
      } catch (error) {
        // SVG directory doesn't exist for this icon
        throw new Error(`Failed to process folder ${folder}: ${error}`);
      }
    }, 8)
  );

  await lastValueFrom(processFiles$);

  // copy index.min.json from outDir to the public directory
  const indexMinPath = resolve(outDir, "index.min.json");
  const indexMinContent = await readFile(indexMinPath, "utf-8");
  await writeFile(resolve(publicDir, "index.json"), indexMinContent, "utf-8");

  // remove the assets directory
  await rm(resolve(outDir), { recursive: true, force: true });
}

async function buildCombinedIndex() {
  // concatenate all the /dist-icons/assets/SVG/<icon-code-name>-24-regular.svg files into a single file
  // and save to /public/icons.svg
  const assetsDir = resolve(outDir, "assets");
  const publicDir = resolve("public");
  const iconFolders = await readdir(assetsDir);

  let combinedSvg = '<svg xmlns="http://www.w3.org/2000/svg" style="display: none;">\n';

  let progress = 0;
  for (const folder of iconFolders) {
    const svgDir = resolve(assetsDir, folder, "SVG");

    try {
      const svgFiles = await readdir(svgDir);
      const regularFile = svgFiles.find((file) => file.endsWith("_24_regular.svg"));

      if (regularFile) {
        const match = regularFile.match(/ic_fluent_(.+)_24_regular\.svg/);
        if (match) {
          const iconCodeName = match[1].replace(/_/g, "-").toLowerCase();
          const filePath = resolve(svgDir, regularFile);
          let content = await readFile(filePath, "utf-8");

          // Extract the path data from the SVG
          const pathMatch = content.match(/<svg[^>]*>([\s\S]*)<\/svg>/);
          if (pathMatch) {
            combinedSvg += `  <symbol id="${iconCodeName}" viewBox="0 0 24 24">\n`;
            combinedSvg += `    ${pathMatch[1].trim()}\n`;
            combinedSvg += `  </symbol>\n`;
          }
        }
      }

      console.log(`Concatenated icon ${++progress}/${iconFolders.length}: ${folder}`);
    } catch (error) {
      // SVG directory doesn't exist for this icon
    }
  }

  combinedSvg += "</svg>";

  await writeFile(resolve(publicDir, "icons.svg"), combinedSvg, "utf-8");
}
