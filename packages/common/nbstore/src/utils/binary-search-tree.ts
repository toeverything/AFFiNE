/**
 * Represents a node in the binary search tree.
 */
export class TreeNode<T> {
  value: T;
  left: TreeNode<T> | null = null;
  right: TreeNode<T> | null = null;
  parent: TreeNode<T> | null = null;

  constructor(value: T) {
    this.value = value;
  }

  /**
   * Gets the value stored in this node.
   */
  getValue(): T {
    return this.value;
  }
}

/**
 * Binary Search Tree implementation using iterative (non-recursive) algorithms.
 */
export class BinarySearchTree<T> {
  root: TreeNode<T> | null = null;
  private size = 0;
  private readonly compareFunction: (a: T, b: T) => number;

  /**
   * Creates a new binary search tree with a custom comparison function.
   *
   * @param compareFunction - Function that compares two elements.
   *   Should return negative if a < b, zero if a = b, positive if a > b.
   */
  constructor(compareFunction: (a: T, b: T) => number) {
    this.compareFunction = compareFunction;
  }

  /**
   * Inserts a value into the tree.
   *
   * @param value - The value to insert
   * @returns The newly created node
   */
  insert(value: T): TreeNode<T> {
    const newNode = new TreeNode<T>(value);

    if (this.root === null) {
      this.root = newNode;
      this.size++;
      return newNode;
    }

    let current = this.root;

    while (true) {
      const compareResult = this.compareFunction(value, current.value);

      if (compareResult < 0) {
        // Go left
        if (current.left === null) {
          current.left = newNode;
          newNode.parent = current;
          this.size++;
          return newNode;
        }
        current = current.left;
      } else if (compareResult > 0) {
        // Go right
        if (current.right === null) {
          current.right = newNode;
          newNode.parent = current;
          this.size++;
          return newNode;
        }
        current = current.right;
      } else {
        // Value already exists, replace it
        current.value = value;
        return current;
      }
    }
  }

  /**
   * Finds a node with the given value.
   *
   * @param value - The value to find
   * @returns The node containing the value, or null if not found
   */
  find(value: T): TreeNode<T> | null {
    let current = this.root;

    while (current !== null) {
      const compareResult = this.compareFunction(value, current.value);

      if (compareResult === 0) {
        return current;
      } else if (compareResult < 0) {
        current = current.left;
      } else {
        current = current.right;
      }
    }

    return null;
  }

  /**
   * Removes a value from the tree.
   *
   * @param value - The value to remove
   * @returns True if the value was removed, false if it wasn't found
   */
  remove(value: T): boolean {
    const nodeToRemove = this.find(value);

    if (nodeToRemove === null) {
      return false;
    }

    this.removeNode(nodeToRemove);
    return true;
  }

  /**
   * Removes a specific node from the tree.
   *
   * @param node - The node to remove
   */
  removeNode(node: TreeNode<T>): void {
    // Case 1: Node has no children
    if (node.left === null && node.right === null) {
      if (node.parent === null) {
        // Node is root
        this.root = null;
      } else if (node === node.parent.left) {
        node.parent.left = null;
      } else {
        node.parent.right = null;
      }
      this.size--;
    }
    // Case 2: Node has one child (right)
    else if (node.left === null) {
      if (node.parent === null) {
        // Node is root
        this.root = node.right;
        if (this.root) {
          this.root.parent = null;
        }
      } else if (node === node.parent.left) {
        node.parent.left = node.right;
        if (node.right) {
          node.right.parent = node.parent;
        }
      } else {
        node.parent.right = node.right;
        if (node.right) {
          node.right.parent = node.parent;
        }
      }
      this.size--;
    }
    // Case 3: Node has one child (left)
    else if (node.right === null) {
      if (node.parent === null) {
        // Node is root
        this.root = node.left;
        if (this.root) {
          this.root.parent = null;
        }
      } else if (node === node.parent.left) {
        node.parent.left = node.left;
        if (node.left) {
          node.left.parent = node.parent;
        }
      } else {
        node.parent.right = node.left;
        if (node.left) {
          node.left.parent = node.parent;
        }
      }
      this.size--;
    }
    // Case 4: Node has two children
    else {
      // Find the successor (minimum value in right subtree)
      const successor = this.findMin(node.right);

      // Save successor value
      const successorValue = successor.value;

      // Instead of recursively calling removeNode, we'll handle successor removal directly
      // The successor must have at most one child (the right child)

      // Remove the successor - it can't have a left child by definition
      if (successor.parent === node) {
        // Successor is direct child of node we're removing
        node.right = successor.right;
        if (successor.right) {
          successor.right.parent = node;
        }
      } else {
        // Successor is further down the tree
        // oxlint-disable-next-line no-non-null-assertion
        successor.parent!.left = successor.right;
        if (successor.right) {
          successor.right.parent = successor.parent;
        }
      }

      // Copy successor value to the node we're removing
      node.value = successorValue;

      // Decrement size counter
      this.size--;
    }
  }

  /**
   * Finds the node with the minimum value in the subtree rooted at the given node.
   *
   * @param subtreeRoot - The root of the subtree to search
   * @returns The node with the minimum value
   */
  private findMin(subtreeRoot: TreeNode<T>): TreeNode<T> {
    let current = subtreeRoot;

    while (current.left !== null) {
      current = current.left;
    }

    return current;
  }

  /**
   * Finds the node with the maximum value in the subtree rooted at the given node.
   *
   * @param subtreeRoot - The root of the subtree to search
   * @returns The node with the maximum value
   */
  private findMax(subtreeRoot: TreeNode<T>): TreeNode<T> {
    let current = subtreeRoot;

    while (current.right !== null) {
      current = current.right;
    }

    return current;
  }

  /**
   * Returns the node with the maximum value in the tree.
   *
   * @returns The node with the maximum value, or null if the tree is empty
   */
  max(): TreeNode<T> | null {
    if (this.root === null) {
      return null;
    }

    return this.findMax(this.root);
  }

  /**
   * Returns the node with the minimum value in the tree.
   *
   * @returns The node with the minimum value, or null if the tree is empty
   */
  min(): TreeNode<T> | null {
    if (this.root === null) {
      return null;
    }

    return this.findMin(this.root);
  }

  /**
   * Clears all nodes from the tree.
   */
  clear(): void {
    this.root = null;
    this.size = 0;
  }

  /**
   * Returns the number of nodes in the tree.
   *
   * @returns The number of nodes
   */
  count(): number {
    return this.size;
  }
}
