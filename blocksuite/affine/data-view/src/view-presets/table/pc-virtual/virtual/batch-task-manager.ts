import { LinkedList, type LinkedListNode } from './linked-list';

type Task = () => false | void;

export class TaskNode {
  private _priority?: number;
  private _linkedListNode?: LinkedListNode<Task>;
  constructor(private readonly manager: BatchTaskManager) {}

  get priority() {
    return this._priority;
  }

  cancel() {
    if (this._linkedListNode?.active) {
      this._linkedListNode.remove();
    }
  }

  updateTask(priority: number, task: Task, toFront = false) {
    this.cancel();
    this._linkedListNode = this.manager.addTask(priority, task, toFront);
    this._priority = priority;
  }
}

export class BatchTaskManager {
  private readonly queues: LinkedList<Task>[] = [];

  constructor(
    private readonly batchSizes: number[],
    private readonly totalBatchSize: number
  ) {
    this.queues = batchSizes.map(() => new LinkedList<Task>());
  }

  private isRunning = false;

  newTask() {
    return new TaskNode(this);
  }

  addTask(priority: number, task: Task, toFront = false) {
    const linkedList = this.queues[priority];
    if (!linkedList) {
      throw new Error('Priority index out of bounds');
    }
    const linkedListNode = linkedList[toFront ? 'prepend' : 'append'](task);
    if (!this.isRunning) {
      this.isRunning = true;
      Promise.resolve()
        .then(() => {
          this.run();
        })
        .catch(e => {
          console.error(e);
        });
    }
    return linkedListNode;
  }

  private run(): void {
    let totalBatchCount = this.totalBatchSize;
    let skipCount = 0;
    let tasksExecuted = false;
    const runTaskArr = this.queues.map(() => 0);
    for (let i = this.queues.length - 1; i >= 0; i--) {
      const queue = this.queues[i];
      let priorityBatchCount = this.batchSizes[i];
      if (!queue || !priorityBatchCount) continue;
      while (
        !queue.isEmpty() &&
        totalBatchCount > 0 &&
        priorityBatchCount > 0
      ) {
        const node = queue.pop();
        if (!node) break;

        const task = node.value;
        const result = task();

        if (result !== false) {
          totalBatchCount--;
          priorityBatchCount--;
          tasksExecuted = true;
          runTaskArr[i] = (runTaskArr[i] ?? 0) + 1;
        }
      }
    }

    if (tasksExecuted) {
      console.log(
        'run task count',
        ...runTaskArr,
        'skip count',
        skipCount,
        'total task count',
        ...this.queues.map(arr => arr.size)
      );
    }

    const hasRemainingTasks = this.queues.some(queue => !queue.isEmpty());

    if (hasRemainingTasks) {
      requestAnimationFrame(() => {
        this.run();
      });
    } else {
      this.isRunning = false;
    }
  }

  clean(): void {
    for (const queue of this.queues) {
      queue.clear();
    }
    this.isRunning = false;
  }
}
