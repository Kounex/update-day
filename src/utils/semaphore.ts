// Caps how many tasks run at once; the rest wait in FIFO order.
export default class Semaphore {
  private running = 0;
  private readonly waiting: Array<() => void> = [];

  constructor(private readonly limit: number) {}

  public get active(): number {
    return this.running;
  }

  public get queued(): number {
    return this.waiting.length;
  }

  public async run<T>(task: () => Promise<T>): Promise<T> {
    if (this.running >= this.limit) {
      await new Promise<void>((resolve) => {
        this.waiting.push(resolve);
      });
    } else {
      this.running++;
    }

    try {
      return await task();
    } finally {
      const next = this.waiting.shift();
      if (next) {
        // The slot passes straight to the next task.
        next();
      } else {
        this.running--;
      }
    }
  }
}
