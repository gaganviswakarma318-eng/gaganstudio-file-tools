# GaganStudio File Tools

**One workspace. Every file.**

GaganStudio File Tools (GSFT) is a local-first workspace for resizing, compressing, converting, and managing files. This repository is under active development; the current milestone provides browser-local image resizing and PDF extraction, splitting, merge, page rotation and reordering, and lossless structural optimization in the web application and Electron shell.

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

Build the web app with `corepack pnpm build:web`, run unit tests with `corepack pnpm test`, browser tests with `corepack pnpm test:e2e`, and check TypeScript with `corepack pnpm typecheck`.

## Current capabilities

- Select or drop multiple image files; file type is checked from its contents.
- Resize locally in a Web Worker with aspect-ratio lock, fit/cover/fill, and PNG/JPEG/WebP output.
- Compare original and resized previews, dimensions, and file sizes; process through a cancellable queue and download results.
- Extract, split, rotate, or reorder PDF pages, merge multiple PDFs in selected order, or apply lossless structural PDF optimization; original documents are never overwritten.
- Shared processing contracts, capability-aware routing, and browser API availability messages.
- Web, Electron development shell, light/dark/system appearance, and responsive layout.

Install the Playwright test browser once with `corepack pnpm exec playwright install chromium`.

Image resizing and PDF operations run in browser Web Workers. Image resizing additionally requires `createImageBitmap` and `OffscreenCanvas`; it does not preserve image metadata or animated GIF frames. PDF inputs are limited to 250 MB per file; merge supports up to 50 files and 250 MB total. Splitting bundles at most 200 PDFs and 250 MB of generated PDF data into one ZIP. Page reordering requires every page exactly once, with a maximum of 20,000 pages. `pdf-lib` may not preserve interactive forms, attachments, or cross-page navigation. PDF rotation changes page display orientation without modifying page content. PDF optimization uses lossless structural reserialization and does not recompress embedded images, so reduced file size is not guaranteed. AVIF and TIFF detection is informational; decode support depends on the browser. Other document, video, audio, archive, remote processing, and production installers are not implemented yet. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the current processing flow and security boundaries.

See [docs/PROJECT_STATUS.md](docs/PROJECT_STATUS.md) for phase tracking and known limitations.
