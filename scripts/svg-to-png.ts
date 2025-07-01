import { readdir, readFile } from "fs/promises";
import { resolve, extname, basename } from "path";
import { mkdirSync, existsSync } from "fs";
import sharp from "sharp";
import { from, mergeMap, lastValueFrom } from "rxjs";
import { updateProgress } from "./progress-bar";

const publicDir = resolve("public");
const outputDir = resolve("pngs");

main();

async function main() {
  console.log("Starting SVG to PNG conversion process...");

  // Ensure output directory exists
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  console.log("Scanning for SVG files...");
  const svgFiles = await getSvgFiles();

  if (svgFiles.length === 0) {
    console.log("No SVG files found for conversion.");
    return;
  }

  console.log(`Found ${svgFiles.length} SVG files to convert`);

  let progress = 0;
  let errors = 0;

  const conversion$ = from(svgFiles).pipe(
    mergeMap(async (svgFile) => {
      try {
        await convertSvgToPng(svgFile);
      } catch (error) {
        console.error(`Failed to convert ${svgFile}:`, error);
        errors++;
      }
      updateProgress(++progress, svgFiles.length, "Converting SVGs to PNG", errors);
    }, 8) // Process 8 files concurrently
  );

  await lastValueFrom(conversion$);

  console.log(`Conversion completed! ${svgFiles.length - errors} files converted successfully.`);
  if (errors > 0) {
    console.log(`${errors} files failed to convert.`);
  }
}

async function getSvgFiles(): Promise<string[]> {
  try {
    const files = await readdir(publicDir);

    // Filter for SVG files that don't end with -00-style.svg pattern
    const svgFiles = files.filter((file) => {
      if (extname(file) !== ".svg") return false;

      // Exclude files ending with pattern like *-00-filled.svg or *-00-regular.svg
      const excludePattern = /-(filled|regular)\.svg$/;
      if (excludePattern.test(file)) return false;

      return true;

      // TEMP: Only process icons that start with "a" for testing
      // return file.toLowerCase().startsWith('a');
    });

    return svgFiles.map((file) => resolve(publicDir, file));
  } catch (error) {
    console.error("Failed to read public directory:", error);
    return [];
  }
}

async function convertSvgToPng(svgFilePath: string): Promise<void> {
  const svgContent = await readFile(svgFilePath, "utf-8");

  // Optional: Modify SVG content here if needed
  const modifiedSvgContent = modifySvgContent(svgContent);

  // Create PNG filename
  const fileName = basename(svgFilePath, ".svg");
  const pngFilePath = resolve(outputDir, `${fileName}.png`);

  // Convert SVG to PNG using Sharp
  await sharp(Buffer.from(modifiedSvgContent))
    .resize(256, 256) // Set desired PNG size
    .flatten({ background: "#ffffff" }) // Add white background
    .png({
      quality: 90,
      compressionLevel: 9,
    })
    .toFile(pngFilePath);
}

function modifySvgContent(svgContent: string): string {
  // Extract the "regular" symbol and convert to standalone SVG

  // Find the regular symbol
  const regularSymbolMatch = svgContent.match(/<symbol id="regular"[^>]*viewBox="([^"]*)"[^>]*>([\s\S]*?)<\/symbol>/);

  if (!regularSymbolMatch) {
    // If no regular symbol found, try to return the content as-is or throw error
    console.warn("No 'regular' symbol found in SVG content");
    return svgContent;
  }

  const [, viewBox, symbolContent] = regularSymbolMatch;

  // Create a standalone SVG with the regular symbol content
  const standaloneSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="256" height="256" >
${symbolContent.trim()}
</svg>`;

  return standaloneSvg;
}
