# Architecture

GSFT is a pnpm monorepo with a shared React web renderer and an Electron shell. The web build is also loaded by Electron, while browser APIs remain the execution boundary for the current image operation.

## Packages

- `apps/web` owns the React interface and Vite browser build.
- `apps/desktop/electron` owns the Electron main process and isolated preload. Renderer Node integration is disabled.
- `packages/shared` contains cross-package job and image option types.
- `packages/core` contains image signature detection, input checks, and the cancellable bounded job queue.
- `packages/processors/image` contains the browser image pipeline. The processor starts a module Web Worker; the worker decodes with `createImageBitmap`, draws with `OffscreenCanvas`, and encodes to PNG, JPEG, or WebP.

## Current processing flow

The UI adds selected files to `JobManager`. The manager limits concurrency, tracks job state, and supplies an `AbortSignal`. The image processor passes the file and validated options to a dedicated worker. Cancellation terminates that worker. The worker checks the signature and size, decodes, applies the requested fit mode, encodes a Blob, and returns the actual dimensions. The renderer exposes a download only after successful completion.

The Canvas-based pipeline strips metadata. JPEG uses a white background; PNG and WebP retain alpha. Animated GIF is rejected to avoid dropping frames. Browser support for decoding AVIF and TIFF varies. The image worker reports no fabricated percentage because browser encoding does not provide reliable progress.

## Desktop security boundary

Electron enables context isolation and sandboxing and disables Node integration. The renderer currently uses the same browser worker pipeline as the web app; no native processor or file-system bridge is exposed yet. Native processing, native dialogs, remote processing, and a capability-based location router remain future work.

## Planned expansion

PDF, document, video, audio, and archive processors should be independent packages behind a shared processing contract. Native executables must be invoked only from a trusted main-process/service layer using fixed executable allowlists, validated arguments, and timeouts. Remote processing must remain opt-in and disabled until configured.
