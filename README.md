# GaganStudio File Tools

**One workspace. Every file.**

GaganStudio File Tools (GSFT) is a local-first workspace for resizing, compressing, converting, and managing files. This repository is under active development; the current milestone provides the web application, an Electron desktop shell, and browser-local image resizing.

## Requirements

- Node.js 20.19+ or 22.12+
- Corepack and pnpm 9+

## Run locally

```powershell
corepack pnpm install
corepack pnpm dev
```

To run the desktop shell in development:

```powershell
corepack pnpm desktop:dev
```

Build the web app with `corepack pnpm build:web`, run the unit tests with `corepack pnpm test`, and check TypeScript with `corepack pnpm typecheck`.

## Current capabilities

- Select or drop multiple image files; file type is checked from its contents.
- Resize locally in a Web Worker with aspect-ratio lock, fit/cover/fill, and PNG/JPEG/WebP output.
- Process files through a cancellable queue and download results without uploading files.
- Web, Electron development shell, light/dark/system appearance, and responsive layout.

The browser image pipeline requires Web Worker, `createImageBitmap`, and `OffscreenCanvas` support; it does not preserve metadata or animated GIF frames. It refuses to process GIFs rather than silently discarding animation. AVIF and TIFF detection is informational; decode support depends on the browser. PDF, document, video, audio, archive, remote processing, and production installers are not implemented yet. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the current processing flow and security boundaries.

See [docs/PROJECT_STATUS.md](docs/PROJECT_STATUS.md) for phase tracking and known limitations.
