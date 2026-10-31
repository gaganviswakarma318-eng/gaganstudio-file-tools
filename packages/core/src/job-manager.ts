import type { ProcessingJob, ResizeOptions } from "@gsft/shared";
import { ProcessingRouter } from "./processing-router";

export class JobManager {
  private readonly jobs = new Map<string, ProcessingJob>();
  private readonly controllers = new Map<string, AbortController>();
  private readonly listeners = new Set<(jobs: ProcessingJob[]) => void>();
  private readonly pending: string[] = [];
  private activeJobs = 0;
  private isPaused = false;

  constructor(
    private readonly router: ProcessingRouter,
    private readonly concurrency = 2,
  ) {}

  subscribe(listener: (jobs: ProcessingJob[]) => void): () => void {
    this.listeners.add(listener);
    listener(this.getJobs());
    return () => this.listeners.delete(listener);
  }

  getJobs(): ProcessingJob[] {
    return [...this.jobs.values()].sort((a, b) => a.createdAt - b.createdAt);
  }

  enqueue(files: File[], options: ResizeOptions): void {
    for (const file of files) {
      const id = crypto.randomUUID();
      this.jobs.set(id, {
        id,
        file,
        status: "queued",
        progress: null,
        createdAt: Date.now(),
        options,
      });
      this.pending.push(id);
    }
    this.emit();
    this.pump();
  }

  cancel(id: string): void {
    const job = this.jobs.get(id);
    if (!job || ["completed", "failed", "cancelled"].includes(job.status)) return;

    const controller = this.controllers.get(id);
    if (controller) {
      controller.abort();
      return;
    }

    this.jobs.set(id, { ...job, status: "cancelled" });
    this.emit();
  }

  pause(): void {
    this.isPaused = true;
  }

  resume(): void {
    this.isPaused = false;
    this.pump();
  }

  cancelAll(): void {
    for (const job of this.getJobs()) this.cancel(job.id);
  }

  private pump(): void {
    while (!this.isPaused && this.activeJobs < this.concurrency && this.pending.length) {
      const id = this.pending.shift();
      if (!id) continue;
      const job = this.jobs.get(id);
      if (!job || job.status !== "queued") continue;
      void this.run(job);
    }
  }

  private async run(job: ProcessingJob): Promise<void> {
    const controller = new AbortController();
    this.controllers.set(job.id, controller);
    this.activeJobs += 1;
    this.jobs.set(job.id, { ...job, status: "validating" });
    this.emit();

    try {
      if (controller.signal.aborted) throw new DOMException("Cancelled", "AbortError");
      this.jobs.set(job.id, { ...this.jobs.get(job.id)!, status: "processing" });
      this.emit();
      const options = job.options;
      if (!options) {
        throw new Error("Resize options are required to process an image.");
      }

      const result = await this.router.process(
        {
          id: job.id,
          category: "image",
          operation: "image.resize",
          input: {
            name: job.file.name,
            mimeType: job.file.type,
            data: job.file,
          },
          options,
        },
        {
          signal: controller.signal,
          reportProgress: ({ percentage }) => {
            const current = this.jobs.get(job.id);
            if (current?.status === "processing") {
              this.jobs.set(job.id, {
                ...current,
                progress:
                  percentage === null ? null : Math.max(0, Math.min(100, percentage)),
              });
              this.emit();
            }
          },
        },
      );
      const current = this.jobs.get(job.id);
      if (current) {
        this.jobs.set(job.id, {
          ...current,
          output: result.output.data,
          outputName: result.output.name,
          outputWidth: result.metadata.width,
          outputHeight: result.metadata.height,
          sourceWidth: result.metadata.sourceWidth,
          sourceHeight: result.metadata.sourceHeight,
          sourceSize: result.statistics.inputBytes,
          location: result.location,
          warnings: result.warnings,
          status: "completed",
          progress: 100,
        });
      }
    } catch (error) {
      const current = this.jobs.get(job.id);
      if (current) {
        this.jobs.set(
          job.id,
          controller.signal.aborted
            ? { ...current, status: "cancelled" }
            : {
                ...current,
                status: "failed",
                error: error instanceof Error ? error.message : "Image processing failed.",
              },
        );
      }
    } finally {
      this.controllers.delete(job.id);
      this.activeJobs -= 1;
      this.emit();
      this.pump();
    }
  }

  private emit(): void {
    const snapshot = this.getJobs();
    for (const listener of this.listeners) listener(snapshot);
  }
}
