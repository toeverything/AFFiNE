import { describe, expect, test } from 'vitest';

import { BinarySearchTree } from '../binary-search-tree';

describe('Binary Search Tree', () => {
  // Helper function to create a tree with numbers
  function createNumberTree() {
    const tree = new BinarySearchTree<number>((a, b) => a - b);
    return tree;
  }

  // Helper function to create a tree with objects
  function createObjectTree() {
    const tree = new BinarySearchTree<{ id: string; value: number }>((a, b) => {
      return a.value === b.value
        ? a.id === b.id
          ? 0
          : a.id > b.id
            ? 1
            : -1
        : a.value - b.value;
    });
    return tree;
  }

  test('insert and find', () => {
    const tree = createNumberTree();

    // Insert values
    tree.insert(10);
    tree.insert(5);
    tree.insert(15);
    tree.insert(3);
    tree.insert(7);

    // Check if values can be found
    expect(tree.find(10)).not.toBeNull();
    expect(tree.find(5)).not.toBeNull();
    expect(tree.find(15)).not.toBeNull();
    expect(tree.find(3)).not.toBeNull();
    expect(tree.find(7)).not.toBeNull();

    // Check value that doesn't exist
    expect(tree.find(99)).toBeNull();

    // Check tree structure
    expect(tree.root?.value).toBe(10);
    expect(tree.root?.left?.value).toBe(5);
    expect(tree.root?.right?.value).toBe(15);
    expect(tree.root?.left?.left?.value).toBe(3);
    expect(tree.root?.left?.right?.value).toBe(7);
  });

  test('min and max', () => {
    const tree = createNumberTree();

    // Empty tree
    expect(tree.min()).toBeNull();
    expect(tree.max()).toBeNull();

    // Insert values
    tree.insert(10);
    tree.insert(5);
    tree.insert(15);
    tree.insert(3);
    tree.insert(7);
    tree.insert(20);
    tree.insert(1);

    // Check min and max
    expect(tree.min()?.getValue()).toBe(1);
    expect(tree.max()?.getValue()).toBe(20);
  });

  test('remove leaf node', () => {
    const tree = createNumberTree();

    tree.insert(10);
    tree.insert(5);
    tree.insert(15);

    // Remove a leaf node
    expect(tree.remove(5)).toBe(true);
    expect(tree.find(5)).toBeNull();
    expect(tree.root?.left).toBeNull();
    expect(tree.count()).toBe(2);
  });

  test('remove node with one child', () => {
    const tree = createNumberTree();

    tree.insert(10);
    tree.insert(5);
    tree.insert(15);
    tree.insert(3);

    // Remove a node with one child
    expect(tree.remove(5)).toBe(true);
    expect(tree.find(5)).toBeNull();
    expect(tree.root?.left?.value).toBe(3);
    expect(tree.count()).toBe(3);
  });

  test('remove node with two children', () => {
    const tree = createNumberTree();

    tree.insert(10);
    tree.insert(5);
    tree.insert(15);
    tree.insert(3);
    tree.insert(7);

    // Remove a node with two children
    expect(tree.remove(5)).toBe(true);
    expect(tree.find(5)).toBeNull();

    // The 7 should replace 5
    expect(tree.root?.left?.value).toBe(7);
    expect(tree.root?.left?.left?.value).toBe(3);
    expect(tree.root?.left?.right).toBeNull();
    expect(tree.count()).toBe(4);
  });

  test('remove root node', () => {
    const tree = createNumberTree();

    // Single node tree
    tree.insert(10);
    expect(tree.remove(10)).toBe(true);
    expect(tree.root).toBeNull();
    expect(tree.count()).toBe(0);

    // Root with children
    tree.insert(10);
    tree.insert(5);
    tree.insert(15);

    expect(tree.remove(10)).toBe(true);
    expect(tree.find(10)).toBeNull();
    // 15 should become the new root
    expect(tree.root?.value).toBe(15);
    expect(tree.root?.left?.value).toBe(5);
    expect(tree.count()).toBe(2);
  });

  test('clear tree', () => {
    const tree = createNumberTree();

    tree.insert(10);
    tree.insert(5);
    tree.insert(15);

    tree.clear();
    expect(tree.root).toBeNull();
    expect(tree.count()).toBe(0);
  });

  test('count', () => {
    const tree = createNumberTree();

    expect(tree.count()).toBe(0);

    tree.insert(10);
    expect(tree.count()).toBe(1);

    tree.insert(5);
    tree.insert(15);
    expect(tree.count()).toBe(3);

    tree.remove(15);
    expect(tree.count()).toBe(2);

    tree.clear();
    expect(tree.count()).toBe(0);
  });

  test('object comparisons', () => {
    const tree = createObjectTree();

    tree.insert({ id: 'a', value: 10 });
    tree.insert({ id: 'b', value: 5 });
    tree.insert({ id: 'c', value: 15 });

    // Same value, different id
    tree.insert({ id: 'd', value: 5 });

    // Find by value and id
    expect(tree.find({ id: 'b', value: 5 })?.getValue()).toEqual({
      id: 'b',
      value: 5,
    });
    expect(tree.find({ id: 'd', value: 5 })?.getValue()).toEqual({
      id: 'd',
      value: 5,
    });

    // The min should be the one with the lowest id
    expect(tree.min()?.getValue()).toEqual({ id: 'b', value: 5 });

    // Remove one of the objects with value 5
    expect(tree.remove({ id: 'b', value: 5 })).toBe(true);

    // The min should now be the other object with value 5
    expect(tree.min()?.getValue()).toEqual({ id: 'd', value: 5 });
  });

  test('replace node with same value', () => {
    const tree = createNumberTree();

    const node1 = tree.insert(10);
    const node2 = tree.insert(10); // This should replace the previous node

    expect(node1).toBe(node2);
    expect(tree.count()).toBe(1);
  });

  test('removeNode', () => {
    const tree = createNumberTree();

    tree.insert(10);
    tree.insert(5);
    tree.insert(15);

    const node = tree.find(5);
    expect(node).not.toBeNull();

    if (node) {
      tree.removeNode(node);
      expect(tree.find(5)).toBeNull();
      expect(tree.count()).toBe(2);
    }
  });
});
