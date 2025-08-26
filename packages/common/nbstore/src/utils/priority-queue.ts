import { BinarySearchTree } from './binary-search-tree';

export class PriorityQueue {
  tree = new BinarySearchTree<{ id: string; priority: number }>((a, b) => {
    return a.priority === b.priority
      ? a.id === b.id
        ? 0
        : a.id > b.id
          ? 1
          : -1
      : a.priority - b.priority;
  });
  priorityMap = new Map<string, number>();

  push(id: string, priority: number = 0) {
    const oldPriority = this.priorityMap.get(id);
    if (oldPriority === priority) {
      return;
    }
    if (oldPriority !== undefined) {
      this.remove(id);
    }
    this.tree.insert({ id, priority });
    this.priorityMap.set(id, priority);
  }

  pop(minimumPriority?: number) {
    const node = this.tree.max();

    if (!node) {
      return null;
    }

    if (
      minimumPriority !== undefined &&
      node.getValue().priority < minimumPriority
    ) {
      return null;
    }

    this.tree.removeNode(node);

    const { id } = node.getValue();
    this.priorityMap.delete(id);

    return id;
  }

  remove(id: string) {
    const priority = this.priorityMap.get(id);
    if (priority === undefined) {
      return false;
    }
    const removed = this.tree.remove({ id, priority });
    if (removed) {
      this.priorityMap.delete(id);
    }

    return removed;
  }

  has(id: string) {
    return this.priorityMap.has(id);
  }

  clear() {
    this.tree.clear();
    this.priorityMap.clear();
  }

  setPriority(id: string, priority: number) {
    if (this.remove(id)) {
      this.push(id, priority);
    }
  }

  get length() {
    return this.tree.count.bind(this.tree);
  }
}
