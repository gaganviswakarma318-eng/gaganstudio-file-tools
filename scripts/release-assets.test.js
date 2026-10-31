import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createManifest, verifyManifests } from "./release-assets.mjs";

const platforms = [
  { name: "Windows", installer: "GSFT-Setup.exe", extra: "GSFT-Setup.exe.blockmap" },
  { name: "Linux", installer: "GSFT.AppImage" },
  { name: "macOS", installer: "GSFT.dmg" },
];

describe("release asset manifests", () => {
  let temporaryDirectory;
  let sourceDirectory;

  beforeEach(async () => {
    temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "gsft-release-assets-"));
    sourceDirectory = path.join(temporaryDirectory, "sources");
    await mkdir(sourceDirectory);
  });

  afterEach(async () => {
    await rm(temporaryDirectory, { recursive: true, force: true });
  });

  async function createFixtureArtifacts(name = "artifacts") {
    const artifactDirectory = path.join(temporaryDirectory, name);
    const platformSourceDirectory = path.join(sourceDirectory, name);
    await mkdir(artifactDirectory);
    await mkdir(platformSourceDirectory);
    for (const platform of platforms) {
      const directory = path.join(platformSourceDirectory, platform.name);
      await mkdir(directory);
      await writeFile(path.join(directory, platform.installer), `installer:${platform.name}`);
      if (platform.extra) await writeFile(path.join(directory, platform.extra), "block map");
      await writeFile(path.join(directory, "ignored.txt"), "not a release asset");
      await createManifest(platform.name, directory);
      for (const name of await readdir(directory)) {
        if (name === "ignored.txt") continue;
        const contents = await readFile(path.join(directory, name));
        await writeFile(path.join(artifactDirectory, name), contents);
      }
    }
    return artifactDirectory;
  }

  it("creates and verifies installer manifests for all supported platforms", async () => {
    const artifactDirectory = await createFixtureArtifacts();

    await expect(verifyManifests(artifactDirectory)).resolves.toBeUndefined();
    for (const { name } of platforms) {
      const manifest = JSON.parse(
        await readFile(path.join(artifactDirectory, `release-manifest-${name}.json`), "utf8"),
      );
      expect(manifest).toMatchObject({ version: "0.1.0", platform: name });
      expect(manifest.files).toHaveLength(name === "Windows" ? 2 : 1);
      for (const file of manifest.files) {
        expect(file.sha256).toMatch(/^[a-f\d]{64}$/);
        expect(file.size).toBeGreaterThan(0);
      }
    }
  });

  it("rejects unsupported platforms and directories without exactly one installer", async () => {
    const directory = path.join(temporaryDirectory, "empty");
    await mkdir(directory);

    await expect(createManifest("FreeBSD", directory)).rejects.toThrow("Unsupported release platform");
    await expect(createManifest("Windows", directory)).rejects.toThrow("Expected one Windows installer");
    await writeFile(path.join(directory, "first.exe"), "first");
    await writeFile(path.join(directory, "second.exe"), "second");
    await expect(createManifest("Windows", directory)).rejects.toThrow("Expected one Windows installer");
  });

  it("rejects a modified installer", async () => {
    const artifactDirectory = await createFixtureArtifacts();
    await writeFile(path.join(artifactDirectory, "GSFT-Setup.exe"), "modified");

    await expect(verifyManifests(artifactDirectory)).rejects.toThrow(
      "Release asset verification failed: GSFT-Setup.exe",
    );
  });

  it("rejects missing and unmanifested release assets", async () => {
    const missingAssetDirectory = await createFixtureArtifacts("missing-artifacts");
    const missingPath = path.join(missingAssetDirectory, "GSFT.dmg");
    await rm(missingPath);
    await expect(verifyManifests(missingAssetDirectory)).rejects.toThrow();

    const unmanifestedAssetDirectory = await createFixtureArtifacts("unmanifested-artifacts");
    await writeFile(path.join(unmanifestedAssetDirectory, "unverified.txt"), "unexpected");
    await expect(verifyManifests(unmanifestedAssetDirectory)).rejects.toThrow(
      "missing or unverified files",
    );
  });

  it("rejects mismatched, duplicate, or path-traversing manifest entries", async () => {
    const artifactDirectory = await createFixtureArtifacts();
    const manifestPath = path.join(artifactDirectory, "release-manifest-Windows.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    manifest.version = "9.9.9";
    await writeFile(manifestPath, JSON.stringify(manifest));
    await expect(verifyManifests(artifactDirectory)).rejects.toThrow(
      "Invalid or mismatched release manifest for Windows",
    );

    manifest.version = "0.1.0";
    manifest.files.push({ ...manifest.files[0] });
    await writeFile(manifestPath, JSON.stringify(manifest));
    await expect(verifyManifests(artifactDirectory)).rejects.toThrow(
      "Duplicate release asset",
    );

    manifest.files.pop();
    manifest.files[0].name = "..\\outside.exe";
    await writeFile(manifestPath, JSON.stringify(manifest));
    await expect(verifyManifests(artifactDirectory)).rejects.toThrow(
      "Invalid file entry in the Windows release manifest",
    );
  });
});
