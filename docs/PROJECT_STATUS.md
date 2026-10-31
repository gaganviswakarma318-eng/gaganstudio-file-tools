# Project status

Updated: 2026-10-31

## Current milestone

Browser-local PDF extraction, merge, page rotation, page reordering, and lossless structural optimization behind the shared processing contract, alongside the verified image-resize flow.

## Implemented

- pnpm workspace with React 19, TypeScript, Vite, Tailwind CSS, and an Electron 36 shell.
- Shared image/job types, signature-based image detection, size and dimension guards, and a cancellable two-worker queue.
- Shared typed processing requests, results, progress context, metadata/statistics, locations, and processor capabilities.
- Processing router that selects available processors by category, operation, and requested execution location, and validates returned request IDs and output size.
- Browser feature probes for Worker, createImageBitmap, OffscreenCanvas, and OffscreenCanvas encoding.
- Local PDF selected-page extraction using `pdf-lib` in a dedicated Web Worker, with strict page/range validation, PDF signature and file-size checks, and page-order preservation.
- Local PDF merge in selected order, with input-count, combined-size, and total-page limits.
- Local clockwise rotation of selected pages by 90, 180, or 270 degrees, preserving unselected pages.
- Local page reordering using a complete, validated page order; every source page must appear exactly once.
- Lossless structural PDF optimization using object streams; it does not recompress embedded images and does not guarantee a smaller file.
- Separate PDF workspace with local-only messaging, operation selection, cancel control, result details, and download; PDF jobs use the shared cancellable queue and source files are never overwritten.
- Browser image resizing for PNG, JPEG, and WebP with inside, cover/crop, fill, quality, and prevent-enlargement settings.
- Dedicated module Web Worker using `createImageBitmap` and `OffscreenCanvas`; the UI thread remains available during decode, draw, and encode.
- Queue results show source/output dimensions and byte sizes, with a savings percentage when output is smaller.
- Completed jobs include managed before/after image previews with dimensions and file sizes.
- Playwright browser tests cover image and PDF worker processing, invalid input handling, downloads, and unavailable capability messaging.
- The image worker and queue communicate through the shared processing contract; unsupported browser capabilities are explained and disable the action in the UI.
- PDF processor capability is independently detected and routed; no remote PDF processor or upload path is configured.
- Responsive dashboard, system/light/dark appearance, multiple-file drop/pick, cancellation, and downloads.
- Electron renderer isolation, sandboxing, and disabled Node integration.
- Architecture, README, and project status documentation.
- Unit tests for file detection, validation, and queue behavior.

## In progress / not implemented

- Production desktop packaging and native open/save dialogs; Electron Builder packaging was attempted but its network fetch was denied in this environment.
- Persistent history, queue retry/pause controls, image compression independent of resizing, animated-image processing, and metadata controls.
- Additional PDF operations; document, video, audio, archive, and remote processing.
- Explicit remote-processing consent flow and remote processor.

## Known limitations

- Worker processing requires `Worker`, `createImageBitmap`, and `OffscreenCanvas`; unsupported browsers receive a clear error, with no main-thread fallback.
- A highly compressed image with excessive decoded pixel dimensions can consume memory during decode before its dimensions can be checked.
- Animated GIF is rejected because a single-frame canvas export would discard animation.
- AVIF/TIFF detection is informational; decoding depends on the browser.
- Canvas exports strip metadata. JPEG output uses a white background; PNG/WebP retain alpha.
- PDF page extraction may not preserve interactive forms, document-level attachments, or cross-page navigation.
- PDF merge and optimization may not preserve interactive forms, document-level attachments, or cross-page navigation. Optimization may not reduce file size.
- PDF rotation changes the page display orientation without modifying page content.
- Page reordering requires an explicit order containing every page exactly once and is limited to 20,000 pages.
- The browser encoder does not expose reliable percentage progress, so active jobs use an indeterminate progress indicator.
- Electron currently uses the browser processing path and does not bundle native image tools.

## Validation status

- `corepack pnpm typecheck` — passed across all workspaces.
- `corepack pnpm test` — passed (37 tests), including PDF execution through the shared queue and extraction, merge, optimization, rotation, and page-order validation coverage.
- `corepack pnpm build:web` — passed; Vite emits separate image and PDF worker assets. The PDF library remains in its worker bundle.
- `corepack pnpm test:e2e` — passed (10 Chromium tests covering image/PDF workers, extraction, merge, optimization, rotation, reordering, invalid inputs, downloads, and unavailable capabilities).
- `corepack pnpm build:desktop` — web build passed, but Electron Builder could not finish because its platform-resource download failed with network `EACCES`.
- Electron development runtime — launched successfully after adding PDF processing; the application window displayed "GaganStudio File Tools".

## Next milestone

Add PDF splitting after reviewing PDF fidelity and multi-file download tradeoffs, using the shared processor capability registry.
