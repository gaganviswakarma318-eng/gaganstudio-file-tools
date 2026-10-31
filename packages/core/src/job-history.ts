import type { ProcessingJob } from "@gsft/shared";

const DATABASE_NAME = "gsft-processing-history";
const DATABASE_VERSION = 1;
const STORE_NAME = "jobs";
const MAX_HISTORY_COUNT = 50;
const MAX_HISTORY_BYTES = 250 * 1024 * 1024;

function getStoredSize(job: ProcessingJob): number {
  const additionalInputBytes =
    job.request.category === "pdf" && job.request.operation === "pdf.merge"
      ? job.request.options.additionalInputs.reduce((total, input) => total + input.data.size, 0)
      : 0;
  return job.file.size + additionalInputBytes + (job.output?.size ?? 0);
}

function selectRetainedJobs(jobs: ProcessingJob[]): ProcessingJob[] {
  const retained: ProcessingJob[] = [];
  let retainedBytes = 0;
  const newestFirst = jobs
    .map((job, index) => ({ job, index }))
    .sort((a, b) => b.job.createdAt - a.job.createdAt || b.index - a.index);

  for (const { job } of newestFirst) {
    const size = getStoredSize(job);
    if (retained.length >= MAX_HISTORY_COUNT || size > MAX_HISTORY_BYTES - retainedBytes) continue;
    retained.push(job);
    retainedBytes += size;
  }

  return retained;
}

export class IndexedDbJobHistory {
  private database?: Promise<IDBDatabase>;

  async load(): Promise<ProcessingJob[]> {
    const database = await this.openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readonly");
      const request = transaction.objectStore(STORE_NAME).getAll() as IDBRequest<ProcessingJob[]>;
      request.onsuccess = () => resolve(request.result.sort((a, b) => a.createdAt - b.createdAt));
      request.onerror = () => reject(request.error ?? new Error("Could not read processing history."));
      transaction.onabort = () => reject(transaction.error ?? new Error("Could not read processing history."));
    });
  }

  async save(jobs: ProcessingJob[]): Promise<number> {
    const retained = selectRetainedJobs(jobs);
    const database = await this.openDatabase();

    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      store.clear();
      for (const job of retained) store.put(job);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("Could not save processing history."));
      transaction.onabort = () => reject(transaction.error ?? new Error("Could not save processing history."));
    });

    return jobs.length - retained.length;
  }

  private openDatabase(): Promise<IDBDatabase> {
    if (this.database) return this.database;
    if (typeof indexedDB === "undefined") {
      return Promise.reject(new Error("Persistent processing history is unavailable in this browser."));
    }

    const database = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
      request.onupgradeneeded = () => {
        request.result.createObjectStore(STORE_NAME, { keyPath: "id" });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("Could not open processing history."));
      request.onblocked = () => reject(new Error("Processing history is blocked by another open application tab."));
    }).catch((error: unknown) => {
      this.database = undefined;
      throw error;
    });

    this.database = database;
    return database;
  }
}
