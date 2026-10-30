import { describe, expect, it, vi } from "vitest";
import type { ResizeOptions } from "@gsft/shared";
import { JobManager } from "./job-manager";

const imageFile = () =>
  new File([new Uint8Array([1])], "image.png", { type: "image/png" });

describe("JobManager", () => {
  it("processes queued files and publishes completion", async () => {
    const processor = vi.fn(async () => ({
      output: new Blob(["done"], { type: "image/png" }),
      width: 100,
      height: 80,
      outputName: "image-resized.png",
    }));
    const manager = new JobManager(processor);
    manager.enqueue([imageFile()]);

    await vi.waitFor(() => expect(manager.getJobs()[0]?.status).toBe("completed"));
    expect(processor).toHaveBeenCalledOnce();
    expect(manager.getJobs()[0]).toMatchObject({
      progress: 100,
      outputWidth: 100,
      outputHeight: 80,
    });
  });

  it("records processor failures without losing the error", async () => {
    const manager = new JobManager(async () => {
      throw new Error("decode failed");
    });
    manager.enqueue([imageFile()]);

    await vi.waitFor(() => expect(manager.getJobs()[0]?.status).toBe("failed"));
    expect(manager.getJobs()[0]?.error).toBe("decode failed");
  });

  it("keeps the resize settings captured when a file is queued", async () => {
    const options: ResizeOptions = {
      width: 640,
      height: 480,
      fit: "inside",
      format: "webp",
      quality: 85,
      preventEnlargement: true,
    };
    const processor = vi.fn(async () => ({
      output: new Blob(),
      width: 320,
      height: 240,
      outputName: "image.webp",
    }));
    const manager = new JobManager(processor);
    manager.enqueue([imageFile()], options);

    await vi.waitFor(() => expect(manager.getJobs()[0]?.status).toBe("completed"));
    expect(processor).toHaveBeenCalledWith(
      expect.any(File),
      expect.any(AbortSignal),
      expect.any(Function),
      options,
    );
  });

  it("cancels work waiting in the queue", () => {
    const manager = new JobManager(async () => ({
      output: new Blob(),
      width: 1,
      height: 1,
      outputName: "done.png",
    }));
    manager.pause();
    manager.enqueue([imageFile()]);
    const job = manager.getJobs()[0];
    if (!job) throw new Error("Expected an enqueued job.");
    manager.cancel(job.id);
    expect(manager.getJobs()[0]?.status).toBe("cancelled");
    manager.resume();
  });
});
