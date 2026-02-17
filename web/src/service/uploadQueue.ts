import type { UploadHandle } from "./fileService";

interface QueueEntry {
  id: string;
  onStart: () => void;
  execute: () => UploadHandle;
  resolve: (value: UploadHandle) => void;
  reject: (reason: unknown) => void;
}

/**
 * Limits concurrent file uploads to avoid overwhelming the server.
 * Queued items wait until a slot opens, then call onStart → execute.
 */
export class UploadQueue {
  private maxConcurrency: number;
  private active = new Map<string, UploadHandle>();
  private queue: QueueEntry[] = [];

  constructor(maxConcurrency: number) {
    this.maxConcurrency = maxConcurrency;
  }

  enqueue(
    id: string,
    onStart: () => void,
    execute: () => UploadHandle,
  ): UploadHandle {
    let outerResolve!: (value: UploadHandle) => void;
    let outerReject!: (reason: unknown) => void;

    const deferred = new Promise<UploadHandle>((res, rej) => {
      outerResolve = res;
      outerReject = rej;
    });

    const entry: QueueEntry = {
      id,
      onStart,
      execute,
      resolve: outerResolve,
      reject: outerReject,
    };
    this.queue.push(entry);
    this.tryNext();

    // Return an UploadHandle whose promise resolves/rejects with the real upload
    const promise = deferred.then((handle) => handle.promise);

    return {
      promise,
      abort: () => {
        // If still queued, remove and reject
        const idx = this.queue.findIndex((e) => e.id === id);
        if (idx !== -1) {
          this.queue.splice(idx, 1);
          outerReject(new Error("Upload cancelled"));
          return;
        }
        // If active, abort the underlying XHR
        const activeHandle = this.active.get(id);
        if (activeHandle) {
          activeHandle.abort();
        }
      },
    };
  }

  cancel(id: string): void {
    const idx = this.queue.findIndex((e) => e.id === id);
    if (idx !== -1) {
      const entry = this.queue.splice(idx, 1)[0];
      entry.reject(new Error("Upload cancelled"));
      return;
    }
    const activeHandle = this.active.get(id);
    if (activeHandle) {
      activeHandle.abort();
    }
  }

  cancelAll(): void {
    // Cancel all queued
    for (const entry of this.queue) {
      entry.reject(new Error("Upload cancelled"));
    }
    this.queue = [];
    // Abort all active
    for (const handle of this.active.values()) {
      handle.abort();
    }
  }

  private tryNext(): void {
    while (this.active.size < this.maxConcurrency && this.queue.length > 0) {
      const entry = this.queue.shift()!;
      entry.onStart();
      const handle = entry.execute();
      this.active.set(entry.id, handle);
      entry.resolve(handle);

      // Clean up when done (success, error, or abort)
      handle.promise.finally(() => {
        this.active.delete(entry.id);
        this.tryNext();
      });
    }
  }
}

export const uploadQueue = new UploadQueue(3);
