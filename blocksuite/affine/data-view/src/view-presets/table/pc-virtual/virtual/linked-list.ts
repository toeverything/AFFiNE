export interface LinkedListNode<T = unknown> {
  value: T;
  prev: LinkedListNode<T> | null;
  next: LinkedListNode<T> | null;
  active: boolean;
  remove: () => void;
}

export class LinkedList<T = unknown> {
  head: LinkedListNode<T> | null = null;
  tail: LinkedListNode<T> | null = null;
  size = 0;

  append(value: T): LinkedListNode<T> {
    const node: LinkedListNode<T> = {
      value,
      prev: null,
      next: null,
      active: true,
      remove: () => this.remove(node),
    };

    if (!this.head) {
      this.head = node;
      this.tail = node;
    } else {
      node.prev = this.tail;
      this.tail!.next = node;
      this.tail = node;
    }

    this.size++;
    return node;
  }

  prepend(value: T): LinkedListNode<T> {
    const node: LinkedListNode<T> = {
      value,
      prev: null,
      next: null,
      active: true,
      remove: () => this.remove(node),
    };

    if (!this.head) {
      this.head = node;
      this.tail = node;
    } else {
      node.next = this.head;
      this.head.prev = node;
      this.head = node;
    }

    this.size++;
    return node;
  }

  remove(node: LinkedListNode<T>): void {
    if (node === this.head && node === this.tail) {
      this.head = null;
      this.tail = null;
    } else if (node === this.head) {
      this.head = node.next;
      if (this.head) {
        this.head.prev = null;
      }
    } else if (node === this.tail) {
      this.tail = node.prev;
      if (this.tail) {
        this.tail.next = null;
      }
    } else {
      if (node.prev) {
        node.prev.next = node.next;
      }
      if (node.next) {
        node.next.prev = node.prev;
      }
    }

    node.prev = null;
    node.next = null;
    node.active = false;
    this.size--;
  }

  shift(): LinkedListNode<T> | null {
    if (!this.head) return null;

    const removedNode = this.head;
    this.remove(removedNode);
    return removedNode;
  }

  pop(): LinkedListNode<T> | null {
    if (!this.tail) return null;

    const removedNode = this.tail;
    this.remove(removedNode);
    return removedNode;
  }

  forEach(
    callback: (value: T, node: LinkedListNode<T>, index: number) => void
  ): void {
    let current = this.head;
    let index = 0;

    while (current) {
      callback(current.value, current, index);
      current = current.next;
      index++;
    }
  }

  forEachReverse(
    callback: (value: T, node: LinkedListNode<T>, index: number) => void
  ): void {
    let current = this.tail;
    let index = this.size - 1;

    while (current) {
      callback(current.value, current, index);
      current = current.prev;
      index--;
    }
  }

  find(
    predicate: (value: T, node: LinkedListNode<T>, index: number) => boolean
  ): LinkedListNode<T> | null {
    let current = this.head;
    let index = 0;

    while (current) {
      if (predicate(current.value, current, index)) {
        return current;
      }
      current = current.next;
      index++;
    }

    return null;
  }

  clear(): void {
    let current = this.head;
    while (current) {
      const next = current.next;
      current.active = false;
      current.next = null;
      current.prev = null;
      current = next;
    }
    this.head = null;
    this.tail = null;
    this.size = 0;
  }

  isEmpty(): boolean {
    return this.size === 0;
  }

  toArray(): T[] {
    const result: T[] = [];
    this.forEach(value => result.push(value));
    return result;
  }
}
