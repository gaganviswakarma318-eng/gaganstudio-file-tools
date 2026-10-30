export type ImageFormat = "png" | "jpeg" | "webp";

export type JobStatus =
  | "queued"
  | "validating"
  | "processing"
  | "completed"
  | "failed"
  | "cancelled";

export type ResizeFit = "inside" | "cover" | "fill";

export interface ResizeOptions {
  width: number;
  height: number;
  fit: ResizeFit;
  format: ImageFormat;
  quality: number;
  preventEnlargement: boolean;
}

export interface ProcessingJob {
  id: string;
  file: File;
  status: JobStatus;
  progress: number | null;
  createdAt: number;
  options?: ResizeOptions;
  output?: Blob;
  outputName?: string;
  outputWidth?: number;
  outputHeight?: number;
  sourceWidth?: number;
  sourceHeight?: number;
  sourceSize?: number;
  error?: string;
}
