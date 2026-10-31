# Project status

Updated: 2026-10-31

## Current milestone

Browser-local PDF tools and local image resizing, compression, and format conversion behind the shared processing contract.

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
- Local PDF splitting into configurable contiguous page groups, bundled as a ZIP with generated per-range PDF names.
- Lossless structural PDF optimization using object streams; it does not recompress embedded images and does not guarantee a smaller file.
- Separate PDF workspace with local-only messaging, operation selection, cancel control, result details, and download; PDF jobs use the shared cancellable queue and source files are never overwritten.
- Browser image resizing for PNG, JPEG, WebP, and GIF with inside, cover/crop, fill, quality, and prevent-enlargement settings.
- Independent image compression through quality-controlled JPEG or WebP encoding; source pixel dimensions are preserved and processing remains in the image worker and shared queue.
- Image format conversion between PNG, JPEG, WebP, and GIF while preserving source pixel dimensions, using the same cancellable local worker queue.
- Animated GIF resize and GIF-to-GIF conversion preserve frame count, delays, loop count, transparency, and disposal behavior; animated-to-still export is rejected.
- GIF decoding and output are bounded by 300 frames, 20 million source-canvas pixels, 50 million decoded frame-patch pixels, 100 million output frame pixels, and 250 MB of generated output.
- Image metadata is stripped by default; opt-in preservation supports selected camera/capture EXIF fields for JPEG-to-JPEG jobs, excludes GPS, orientation, thumbnails, comments, and device identifiers, and is capped at 32 MB per JPEG.
- Processing history is stored locally in IndexedDB, bounded to 50 jobs or 250 MB of source/output data, and supports interrupted-job recovery, retry, removal, history clearing, and queue pause/resume controls across image and PDF workspaces.
- Electron exposes restricted native open/save dialogs through an isolated preload; the main process only reads user-selected image/PDF files and writes outputs to a user-selected destination.
- Electron Builder is configured to create Windows NSIS, Linux AppImage, and macOS DMG packages; builds are unsigned.
- Dedicated module Web Worker using `createImageBitmap` and `OffscreenCanvas`; the UI thread remains available during decode, draw, and encode.
- Queue results show source/output dimensions and byte sizes, with a savings percentage when output is smaller.
- Completed jobs include managed before/after image previews with dimensions and file sizes.
- Playwright browser tests cover image resizing/compression, PDF worker operations, invalid input handling, downloads, and unavailable capability messaging.
- The image worker and queue communicate through the shared processing contract; unsupported browser capabilities are explained and disable the action in the UI.
- PDF processor capability is independently detected and routed; no remote PDF processor or upload path is configured.
- Responsive dashboard, system/light/dark appearance, multiple-file drop/pick, cancellation, and downloads.
- Electron renderer isolation, sandboxing, and disabled Node integration.
- Architecture, README, and project status documentation.
- Unit tests for file detection, validation, and queue behavior.

## In progress / not implemented

- Cross-platform tag-triggered package builds and GitHub Release publication are automated. A manual non-publishing mode builds all platform artifacts for hosted validation; run it in GitHub Actions after pushing workflow changes. SHA-256 manifests are verified before publication. Add owner-provided signing certificates and Apple notarization credentials to enable signed releases.
- Additional PDF operations; document, video, audio, archive, and remote processing.
- Explicit remote-processing consent flow and remote processor.

## Known limitations

- Worker processing requires `Worker`, `createImageBitmap`, and `OffscreenCanvas`; unsupported browsers receive a clear error, with no main-thread fallback.
- A highly compressed image with excessive decoded pixel dimensions can consume memory during decode before its dimensions can be checked.
- GIF color is quantized to up to 256 colors per frame; this can shift colors or introduce banding. GIF output is not guaranteed to be smaller.
- Animated GIF inputs must be exported as GIF; still-format export is blocked rather than silently dropping frames.
- AVIF/TIFF detection is informational; decoding depends on the browser.
- Metadata preservation is currently limited to an allowlist for JPEG-to-JPEG operations; other source/output combinations are stripped with a result warning. Opt-in preservation is limited to files up to 32 MB.
- Image exports strip metadata by default. JPEG output uses a white background; PNG/WebP/GIF retain alpha.
- Image compression changes encoding to JPEG or WebP and can be lossy; it preserves pixel dimensions but may not reduce every source file's size.
- Image conversion to JPEG/WebP can be lossy and JPEG conversion flattens transparency against white; all conversions strip metadata.
- PDF page extraction may not preserve interactive forms, document-level attachments, or cross-page navigation.
- PDF merge and optimization may not preserve interactive forms, document-level attachments, or cross-page navigation. Optimization may not reduce file size.
- PDF rotation changes the page display orientation without modifying page content.
- Page reordering requires an explicit order containing every page exactly once and is limited to 20,000 pages.
- PDF splitting is limited to 200 output PDFs and 250 MB of generated PDF data per ZIP.
- The browser encoder does not expose reliable percentage progress, so active jobs use an indeterminate progress indicator.
- Electron currently uses the browser processing path and does not bundle native image tools.
- Persistent history depends on browser IndexedDB and is subject to browser storage quotas; the app reports storage errors and retains at most 50 jobs or an estimated 250 MB.

## Validation status

- `corepack pnpm typecheck` — passed across all workspaces.
- `corepack pnpm test` — passed (46 tests), including PDF execution through the shared queue and extraction, splitting, merge, optimization, rotation, page-order validation, and release-manifest integrity coverage.
- `corepack pnpm build:web` — passed; Vite emits separate image and PDF worker assets. The PDF library remains in its worker bundle.
- `corepack pnpm test:e2e --workers=1` — passed (25 Chromium tests for metadata stripping/opt-in safe EXIF preservation, JPEG format warnings, animated GIF fidelity and safety limits, PDF operations, invalid inputs, downloads, and unavailable capabilities).
- `corepack pnpm build:desktop` — passed; generated the Windows x64 NSIS installer and unpacked application. Linux AppImage and macOS DMG builds require their corresponding hosts.
- Release workflow — configured for Windows NSIS, Linux AppImage, macOS DMG, and GitHub Release publication; signing activates only when complete platform credentials are configured. Hosted platform jobs have not yet run.
- Release checksums — SHA-256 manifests are generated per platform and verified before publication; automated tests cover all three platform formats and reject tampered, missing, duplicate, or unmanifested files.
- Electron development runtime — launched successfully after adding PDF processing; the application window displayed "GaganStudio File Tools".

## Next milestone

Validate the hosted multi-platform release workflow; configure and verify code signing/notarization with the release owner's credentials.
