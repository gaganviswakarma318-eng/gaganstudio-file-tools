# Architecture

GSFT is a pnpm monorepo with a shared React web renderer and an Electron shell. The web build is also loaded by Electron, while browser APIs remain the execution boundary for current image and PDF operations.

## Packages

- `apps/web` owns the React interface and Vite browser build.
- `apps/desktop/electron` owns the Electron main process and isolated preload. Renderer Node integration is disabled.
- `packages/shared` contains cross-package job, processing request/result/context, capability, and image option types.
- `packages/core` contains image signature detection, input checks, the cancellable bounded job queue, browser API capability probes, and the processing router.
- `packages/processors/image` contains the browser image processor adapter. It implements the shared processor contract and starts a module Web Worker; the worker decodes with `createImageBitmap`, draws with `OffscreenCanvas`, and encodes resize/convert output to PNG/JPEG/WebP/GIF or compression output to JPEG/WebP.
- `packages/processors/pdf` contains the browser PDF page-extraction processor, strict page-range parser, and `pdf-lib` worker.

## Current processing flow

The image UI adds selected files and immutable options to `JobManager`. The manager limits concurrency, creates typed `image.resize`, `image.compress`, or `image.convert` requests, and supplies an `AbortSignal` through the processing context. Compression and conversion preserve source pixel dimensions; compression targets JPEG/WebP, while conversion supports PNG/JPEG/WebP/GIF. GIF input is composited frame-by-frame with disposal handling; frame delays and loop counts are retained when output remains GIF, while conversion to a still format is explicitly rejected. GIF workloads are capped at 300 frames, 20 million source-canvas pixels, 50 million decoded patch pixels, 100 million output frame pixels, and 250 MB of encoded output. GIF output uses per-frame palettes of up to 256 colors. Other conversions use the same local worker; lossy output may increase file size and metadata is stripped. The PDF workspace submits typed extraction, splitting, merge, rotation, reordering, or compression requests to the same queue. `ProcessingRouter` selects a processor by category, operation, requested location, input format, and detected capability. Browser processors pass requests to dedicated workers; cancellation terminates the worker. The image worker resizes, compresses, or converts and encodes a Blob. The PDF worker validates PDF signatures, file and page limits, parses page ranges for extraction/rotation/reordering, copies pages in order for extraction/merge/reordering, splits PDFs into configurable contiguous page groups and bundles them into a ZIP, rotates selected page display orientations, or reserializes the PDF with object streams for lossless structural optimization. Splitting is limited to 200 output PDFs and 250 MB of generated PDF data. Reordering requires every source page exactly once and preserves the page content. It returns output size/page counts/duration/location/warnings. PDF compression does not recompress embedded images and is not guaranteed to reduce file size. Rotation changes page display orientation without modifying page content. The router checks request identity and output integrity before the renderer exposes a download.

Image capability detection checks for Web Workers, `createImageBitmap`, `OffscreenCanvas`, and `OffscreenCanvas.convertToBlob`. PDF capability detection independently checks for Web Workers (the `pdf-lib` library is bundled with its worker). Unsupported browser environments expose an unavailable capability and a reason; the UI disables the affected operation rather than silently falling back to main-thread work.

The image pipeline strips metadata. JPEG uses a white background; PNG, WebP, and GIF retain alpha. Animated GIFs can only be exported as GIF to prevent accidental frame loss. GIF palettes may introduce color changes and output size is not guaranteed to shrink. Browser support for decoding AVIF and TIFF varies. The image worker reports no fabricated percentage because browser encoding does not provide reliable progress. PDF extraction, splitting, merging, and reordering write new PDFs and preserve copied page content; interactive forms, document-level attachments, and cross-page navigation may not survive copying. Merge supports up to 50 PDFs and 250 MB total; PDF inputs are limited to 20,000 pages each and merged output to 20,000 pages.

## Desktop security boundary

Electron enables context isolation and sandboxing and disables Node integration. The renderer currently uses the same browser worker pipeline as the web app; no native processor or file-system bridge is exposed yet. Native processing, native dialogs, and remote processing remain future work. The router and location/capability types provide a contract for adding these backends without exposing native commands to the renderer.

## Planned expansion

PDF, document, video, audio, and archive processors should be independent packages behind a shared processing contract. Native executables must be invoked only from a trusted main-process/service layer using fixed executable allowlists, validated arguments, and timeouts. Remote processing must remain opt-in and disabled until configured.
