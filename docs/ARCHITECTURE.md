# Architecture

GSFT is a pnpm monorepo with a shared React web renderer and an Electron shell. The web build is also loaded by Electron, while browser APIs remain the execution boundary for the current image operation.

## Packages

- `apps/web` owns the React interface and Vite browser build.
- `apps/desktop/electron` owns the Electron main process and isolated preload. Renderer Node integration is disabled.
- `packages/shared` contains cross-package job, processing request/result/context, capability, and image option types.
- `packages/core` contains image signature detection, input checks, the cancellable bounded job queue, browser API capability probes, and the processing router.
- `packages/processors/image` contains the browser image processor adapter. It implements the shared processor contract and starts a module Web Worker; the worker decodes with `createImageBitmap`, draws with `OffscreenCanvas`, and encodes to PNG, JPEG, or WebP.

## Current processing flow

The UI adds selected files and an immutable options snapshot to `JobManager`. The manager limits concurrency, creates a typed `image.resize` request, and supplies an `AbortSignal` through the processing context. `ProcessingRouter` selects a processor by category, operation, requested location, and detected capability. The browser image processor passes the request to a dedicated worker. Cancellation terminates that worker. The worker checks the signature and size, decodes, applies the requested fit mode, encodes a Blob, and returns a structured result with actual dimensions, file sizes, duration, location, and warnings. The router checks request identity and output integrity before the renderer exposes a download.

Capability detection checks for Web Workers, `createImageBitmap`, `OffscreenCanvas`, and `OffscreenCanvas.convertToBlob`. Unsupported browser environments expose an unavailable capability and a reason; the UI disables image processing rather than silently falling back to main-thread work.

The Canvas-based pipeline strips metadata. JPEG uses a white background; PNG and WebP retain alpha. Animated GIF is rejected to avoid dropping frames. Browser support for decoding AVIF and TIFF varies. The image worker reports no fabricated percentage because browser encoding does not provide reliable progress.

## Desktop security boundary

Electron enables context isolation and sandboxing and disables Node integration. The renderer currently uses the same browser worker pipeline as the web app; no native processor or file-system bridge is exposed yet. Native processing, native dialogs, and remote processing remain future work. The router and location/capability types provide a contract for adding these backends without exposing native commands to the renderer.

## Planned expansion

PDF, document, video, audio, and archive processors should be independent packages behind a shared processing contract. Native executables must be invoked only from a trusted main-process/service layer using fixed executable allowlists, validated arguments, and timeouts. Remote processing must remain opt-in and disabled until configured.
