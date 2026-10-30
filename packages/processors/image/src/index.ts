import type { ResizeOptions } from "@gsft/shared";

interface WorkerSuccess {
  output: Blob;
  width: number;
  height: number;
  sourceWidth: number;
  sourceHeight: number;
}

export async function resizeImage(
  file: File,
  options: ResizeOptions,
  signal: AbortSignal,
  _onProgress: (progress: number) => void,
): Promise<WorkerSuccess & { outputName: string }> {
  if (typeof Worker === "undefined") {
    throw new Error("This browser does not support background image processing.");
  }

  const worker = new Worker(new URL("./image.worker.ts", import.meta.url), { type: "module" });
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      signal.removeEventListener("abort", onAbort);
      worker.terminate();
    };
    const onAbort = () => {
      cleanup();
      reject(new DOMException("Cancelled", "AbortError"));
    };

    if (signal.aborted) return onAbort();
    signal.addEventListener("abort", onAbort, { once: true });
    worker.onmessage = (event: MessageEvent<WorkerSuccess | { error: string }>) => {
      cleanup();
      if ("error" in event.data) {
        reject(new Error(event.data.error));
        return;
      }
      const baseName = file.name.replace(/\.[^.]+$/, "") || "image";
      const extension = options.format === "jpeg" ? "jpg" : options.format;
      resolve({ ...event.data, outputName: `${baseName}-resized.${extension}` });
    };
    worker.onerror = (event) => {
      cleanup();
      reject(new Error(event.message || "Background image processing failed."));
    };
    worker.postMessage({ file, options });
  });
}
