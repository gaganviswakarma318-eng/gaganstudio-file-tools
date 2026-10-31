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

export type FileCategory = "image" | "pdf" | "document" | "video" | "audio" | "archive";
export type ProcessingLocation = "browser" | "desktop" | "remote";
export type ProcessingOperation =
  | "image.resize"
  | "pdf.extract-pages"
  | "pdf.merge"
  | "pdf.compress"
  | "pdf.rotate-pages"
  | "pdf.reorder-pages";
export type ProcessingStage = "validating" | "decoding" | "processing" | "encoding";

export interface ProcessingInput {
  name: string;
  mimeType: string;
  data: Blob;
}

export interface ImageResizeRequest {
  id: string;
  category: "image";
  operation: "image.resize";
  input: ProcessingInput;
  options: ResizeOptions;
  requestedLocation?: ProcessingLocation;
}

export interface PdfExtractPagesRequest {
  id: string;
  category: "pdf";
  operation: "pdf.extract-pages";
  input: ProcessingInput;
  options: {
    pageSelection: string;
  };
  requestedLocation?: ProcessingLocation;
}

export interface PdfMergeRequest {
  id: string;
  category: "pdf";
  operation: "pdf.merge";
  input: ProcessingInput;
  options: {
    additionalInputs: ProcessingInput[];
  };
  requestedLocation?: ProcessingLocation;
}

export interface PdfCompressRequest {
  id: string;
  category: "pdf";
  operation: "pdf.compress";
  input: ProcessingInput;
  options: Record<string, never>;
  requestedLocation?: ProcessingLocation;
}

export interface PdfRotatePagesRequest {
  id: string;
  category: "pdf";
  operation: "pdf.rotate-pages";
  input: ProcessingInput;
  options: {
    pageSelection: string;
    degrees: 90 | 180 | 270;
  };
  requestedLocation?: ProcessingLocation;
}

export interface PdfReorderPagesRequest {
  id: string;
  category: "pdf";
  operation: "pdf.reorder-pages";
  input: ProcessingInput;
  options: {
    pageOrder: string;
  };
  requestedLocation?: ProcessingLocation;
}

export type PdfProcessingRequest =
  | PdfExtractPagesRequest
  | PdfMergeRequest
  | PdfCompressRequest
  | PdfRotatePagesRequest
  | PdfReorderPagesRequest;

export type ProcessingRequest = ImageResizeRequest | PdfProcessingRequest;

export interface ProcessingProgress {
  stage: ProcessingStage | "reading-pages" | "writing-pdf";
  percentage: number | null;
}

export interface ProcessingContext {
  signal: AbortSignal;
  reportProgress: (progress: ProcessingProgress) => void;
}

export interface ProcessingOutput {
  data: Blob;
  name: string;
  mimeType: string;
}

export interface ProcessingMetadata {
  sourceWidth?: number;
  sourceHeight?: number;
  width?: number;
  height?: number;
  format?: string;
  pageCount?: number;
  sourcePageCount?: number;
  rotatedPageCount?: number;
  rotationDegrees?: number;
}

export interface ProcessingStatistics {
  inputBytes: number;
  outputBytes: number;
  durationMs: number;
}

export interface ProcessingResult {
  requestId: string;
  location: ProcessingLocation;
  output: ProcessingOutput;
  metadata: ProcessingMetadata;
  statistics: ProcessingStatistics;
  warnings: string[];
}

export interface ProcessorCapability {
  id: string;
  category: FileCategory;
  operations: ProcessingOperation[];
  location: ProcessingLocation;
  inputFormats: string[];
  outputFormats: string[];
  requirements: string[];
  available: boolean;
  unavailableReason?: string;
}

export interface FileProcessor<Request extends ProcessingRequest = ProcessingRequest> {
  readonly capability: ProcessorCapability;
  process(request: Request, context: ProcessingContext): Promise<ProcessingResult>;
}

export interface ProcessingJob {
  id: string;
  file: File;
  request: ProcessingRequest;
  status: JobStatus;
  progress: number | null;
  createdAt: number;
  options?: ResizeOptions;
  result?: ProcessingResult;
  output?: Blob;
  outputName?: string;
  outputWidth?: number;
  outputHeight?: number;
  sourceWidth?: number;
  sourceHeight?: number;
  sourceSize?: number;
  location?: ProcessingLocation;
  warnings?: string[];
  error?: string;
}
