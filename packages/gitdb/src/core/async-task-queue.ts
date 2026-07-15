export class AsyncTaskQueue {
  private tail: Promise<void> = Promise.resolve();

  enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = this.tail.then(task, task);

    // Keep the chain alive even when a task fails.
    this.tail = run.then(
      () => undefined,
      () => undefined,
    );

    return run;
  }
}
