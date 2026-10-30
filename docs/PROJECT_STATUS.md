# Project status

Updated: 2026-10-31

## Current milestone

Phase 1 foundation and browser-local image resizing, with processing moved to a Web Worker.

## Implemented

- pnpm workspace with React 19, TypeScript, Vite, Tailwind CSS, and an Electron 36 shell.
- Shared image/job types, signature-based image detection, size and dimension guards, and a cancellable two-worker queue.
- Browser image resizing for PNG, JPEG, and WebP with inside, cover/crop, fill, quality, and prevent-enlargement settings.
- Dedicated module Web Worker using `createImageBitmap` and `OffscreenCanvas`; the UI thread remains available during decode, draw, and encode.
- Queue results show source/output dimensions and byte sizes, with a savings percentage when output is smaller.
- Responsive dashboard, system/light/dark appearance, multiple-file drop/pick, cancellation, and downloads.
- Electron renderer isolation, sandboxing, and disabled Node integration.
- Architecture, README, and project status documentation.
- Unit tests for file detection, validation, and queue behavior.

## In progress / not implemented

- End-to-end browser smoke coverage for the worker path and desktop runtime verification after the worker change.
- Production desktop packaging and native open/save dialogs; Electron Builder packaging was attempted but its network fetch was denied in this environment.
- Persistent history, queue retry/pause controls, image compression independent of resizing, animated-image processing, and metadata controls.
- PDF, document, video, audio, archive, and remote processing.
- Capability detection and explicit remote-processing consent flow.

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
- `corepack pnpm test` — passed (9 tests).
- `corepack pnpm build:web` — passed; Vite emitted a separate image worker asset.
- `corepack pnpm build:desktop` — web build passed, but Electron Builder could not finish because its platform-resource download failed with network `EACCES`.
- Interactive browser smoke test — not run in this milestone.

## Next milestone

Verify the worker pipeline in browser and Electron, add automated browser coverage, and then implement the shared processing request/result contract and capability detection before adding another file category.
