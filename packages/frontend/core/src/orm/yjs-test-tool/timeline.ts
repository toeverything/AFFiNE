class Timeline {
  constructor(private readonly tasks: (() => Promise<void>)[] = []) {}

  step(name: string, callback: () => Promise<void>): Timeline {
    return new Timeline([
      ...this.tasks,
      () => {
        console.log(name);
        return callback();
      },
    ]);
  }

  async run() {
    for (const task of this.tasks) {
      await task();
    }
  }
}

export const timeline = new Timeline();
