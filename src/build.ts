import { exec } from "child_process";
import { mkdirSync } from "fs";
import { readFile, readdir, rm, writeFile } from "fs/promises";
import { resolve } from "path";
import { promisify } from "util";
const execAsync = promisify(exec);

main();

async function main() {
  const commitId = await fetchRepoAssets();
  const icons = await buildIndex();
  const index: Index = {
    commit: commitId,
    icons: icons,
  };
  writeFile("dist/index.json", JSON.stringify(index, null, 2), "utf-8");

  const lightIndex = await getLightIndex(icons, commitId);
  writeFile("dist/light-index.json", JSON.stringify(lightIndex, null, 2));
}

async function fetchRepoAssets(): Promise<string> {
  // download the entire folder content from https://github.com/microsoft/fluentui-system-icons/tree/main/assets
  // save them to dist/fluentui-system-icons/assets

  const distDir = "dist";

  // Create temp directory if it doesn't exist
  try {
    await rm(distDir, { recursive: true });
  } catch {}

  await mkdirSync(distDir, { recursive: true });

  // Clone the repository with sparse checkout to get only the assets folder
  await execAsync(`git clone --filter=blob:none --sparse https://github.com/microsoft/fluentui-system-icons.git ${distDir}`);
  await execAsync(`cd ${distDir} && git sparse-checkout set --no-cone`);
  await execAsync(`cd ${distDir} && git sparse-checkout set 'assets/**/*.svg' 'assets/**/*.json'`);

  // Get the commit ID
  const { stdout } = await execAsync(`cd ${distDir} && git rev-parse HEAD`);
  const commitId = stdout.trim();

  console.log(`Repository assets fetched successfully. Commit: ${commitId}`);

  // remove the .git directory to clean up
  await rm(resolve(distDir, ".git"), { recursive: true });

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

interface LightIndex {
  commit: string;
  icons: LightIndexIcon[];
}

async function buildIndex(): Promise<IndexIcon[]> {
  const assetsDir = resolve("dist/assets");
  const assetFolders = await readdir(assetsDir);

  const icons: IndexIcon[] = [];

  for (const folder of assetFolders) {
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
    } catch (error) {
      // SVG directory doesn't exist
    }

    // Write icon.json to the asset folder
    const iconJsonPath = resolve(folderPath, "icon.json");
    await writeFile(iconJsonPath, JSON.stringify(icon, null, 2), "utf-8");

    icons.push(icon);
  }

  return icons;
}

type LightIndexIcon = [name: string, ...metaphor: string[]]; // [name, ...metaphor]

async function getLightIndex(indexIcons: IndexIcon[], commitId: string): Promise<LightIndex> {
  return {
    commit: commitId,
    icons: indexIcons.map((icon) => [icon.name, ...icon.metaphor]),
  };
}
