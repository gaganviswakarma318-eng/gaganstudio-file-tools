import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const platformExtensions = new Map([
  ["Windows", [".exe"]],
  ["Linux", [".AppImage"]],
  ["macOS", [".dmg"]],
]);

async function sha256(filePath) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest("hex");
}

async function createManifest(platform, directory) {
  const extensions = platformExtensions.get(platform);
  if (!extensions) throw new Error(`Unsupported release platform: ${platform}`);

  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const extension = path.extname(entry.name);
    if (!extensions.includes(extension) && !(platform === "Windows" && extension === ".blockmap")) continue;
    const filePath = path.join(directory, entry.name);
    files.push({
      name: entry.name,
      size: (await stat(filePath)).size,
      sha256: await sha256(filePath),
    });
  }

  const installers = files.filter(({ name }) => extensions.includes(path.extname(name)));
  if (installers.length !== 1) {
    throw new Error(`Expected one ${platform} installer, found ${installers.length}.`);
  }

  const { version } = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
  const manifest = { version, platform, files };
  await writeFile(
    path.join(directory, `release-manifest-${platform}.json`),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );
}

async function verifyManifests(directory) {
  const { version } = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
  const expectedPlatforms = [...platformExtensions.keys()];
  const expectedAssets = new Set();
  for (const platform of expectedPlatforms) {
    const manifestName = `release-manifest-${platform}.json`;
    const manifestPath = path.join(directory, manifestName);
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    if (manifest.platform !== platform || manifest.version !== version || !Array.isArray(manifest.files)) {
      throw new Error(`Invalid or mismatched release manifest for ${platform}.`);
    }
    if (expectedAssets.has(manifestName)) throw new Error(`Duplicate release asset: ${manifestName}`);
    expectedAssets.add(manifestName);

    let installerCount = 0;
    for (const file of manifest.files) {
      if (
        typeof file.name !== "string" ||
        path.basename(file.name) !== file.name ||
        path.win32.basename(file.name) !== file.name ||
        !Number.isSafeInteger(file.size) ||
        file.size < 1 ||
        !/^[a-f\d]{64}$/i.test(file.sha256)
      ) {
        throw new Error(`Invalid file entry in the ${platform} release manifest.`);
      }
      if (expectedAssets.has(file.name)) throw new Error(`Duplicate release asset: ${file.name}`);
      expectedAssets.add(file.name);
      if (platformExtensions.get(platform).includes(path.extname(file.name))) installerCount += 1;

      const filePath = path.join(directory, file.name);
      if ((await stat(filePath)).size !== file.size || (await sha256(filePath)) !== file.sha256) {
        throw new Error(`Release asset verification failed: ${file.name}`);
      }
    }
    if (installerCount !== 1) throw new Error(`Expected one ${platform} installer in its manifest.`);
  }

  const directoryEntries = await readdir(directory, { withFileTypes: true });
  if (directoryEntries.some((entry) => !entry.isFile())) {
    throw new Error("The release artifact directory contains an unexpected directory.");
  }
  const actualAssets = directoryEntries.map((entry) => entry.name);
  if (
    actualAssets.length !== expectedAssets.size ||
    actualAssets.some((asset) => !expectedAssets.has(asset))
  ) {
    throw new Error("The release artifact directory contains missing or unverified files.");
  }
}

const [mode, platformOrDirectory, maybeDirectory] = process.argv.slice(2);
try {
  if (mode === "create" && maybeDirectory) {
    await createManifest(platformOrDirectory, path.resolve(maybeDirectory));
  } else if (mode === "verify" && platformOrDirectory) {
    await verifyManifests(path.resolve(platformOrDirectory));
  } else {
    throw new Error("Usage: node scripts/release-assets.mjs create <Windows|Linux|macOS> <directory> | verify <directory>");
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
