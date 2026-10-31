# Project status

Updated: 2026-10-31

## Current milestone

Shared processing contracts, browser capability detection, capability-aware routing, and the verified local image-resize flow.

## Implemented

- pnpm workspace with React 19, TypeScript, Vite, Tailwind CSS, and an Electron 36 shell.
- Shared image/job types, signature-based image detection, size and dimension guards, and a cancellable two-worker queue.
- Shared typed processing requests, results, progress context, metadata/statistics, locations, and processor capabilities.
- Processing router that selects available processors by category, operation, and requested execution location, and validates returned request IDs and output size.
- Browser feature probes for Worker, createImageBitmap, OffscreenCanvas, and OffscreenCanvas encoding.
- Browser image resizing for PNG, JPEG, and WebP with inside, cover/crop, fill, quality, and prevent-enlargement settings.
- Dedicated module Web Worker using `createImageBitmap` and `OffscreenCanvas`; the UI thread remains available during decode, draw, and encode.
- Queue results show source/output dimensions and byte sizes, with a savings percentage when output is smaller.
- Completed jobs include managed before/after image previews with dimensions and file sizes.
- Playwright browser tests cover successful worker resize/output/download, invalid image rejection, and unavailable worker capability messaging.
- The image worker and queue communicate through the shared processing contract; unsupported browser capabilities are explained and disable the action in the UI.
- Responsive dashboard, system/light/dark appearance, multiple-file drop/pick, cancellation, and downloads.
- Electron renderer isolation, sandboxing, and disabled Node integration.
- Architecture, README, and project status documentation.
- Unit tests for file detection, validation, and queue behavior.

## In progress / not implemented

- Production desktop packaging and native open/save dialogs; Electron Builder packaging was attempted but its network fetch was denied in this environment.
- Persistent history, queue retry/pause controls, image compression independent of resizing, animated-image processing, and metadata controls.
- PDF, document, video, audio, archive, and remote processing.
- Explicit remote-processing consent flow and remote processor.

## Known limitations

- Worker processing requires `Worker`, `createImageBitmap`, and `OffscreenCanvas`; unsupported browsers receive a clear error, with no main-thread fallback.
- A highly compressed image with excessive decoded pixel dimensions can consume memory during decode before its dimensions can be checked.
- Animated GIF is rejected because a single-frame canvas export would discard animation.
- AVIF/TIFF detection is informational; decoding depends on the browser.
- Canvas exports strip metadata. JPEG output uses a white background; PNG/WebP retain alpha.
- The browser encoder does not expose reliable percentage progress, so active jobs use an indeterminate progress indicator.
- Electron currently uses the browser processing path and does not bundle native image tools.

## Validation status

- `corepack pnpm typecheck` — passed across all workspaces.
- `corepack pnpm test` — passed (15 tests).
- `corepack pnpm build:web` — passed; Vite emitted a separate image worker asset.
- `corepack pnpm test:e2e` — passed (3 Chromium tests).
- `corepack pnpm build:desktop` — web build passed, but Electron Builder could not finish because its platform-resource download failed with network `EACCES`.
- Electron development runtime — launched successfully; the application window displayed "GaganStudio File Tools".

## Next milestone

Define and implement a PDF processor behind the shared contract, with an explicit browser/desktop capability and no remote path by default.
