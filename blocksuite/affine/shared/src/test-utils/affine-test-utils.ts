import type { BlockModel, Store } from '@blocksuite/store';
import { expect } from 'vitest';

declare module 'vitest' {
  interface Assertion<T = any> {
    toEqualDoc(expected: Store, options?: { compareId?: boolean }): T;
  }
}

const COMPARE_PROPERTIES = new Set(['id']);

function blockToTemplate(block: BlockModel, indent: string = ''): string {
  const props = Object.entries(block.props)
    .filter(([key]) => COMPARE_PROPERTIES.has(key))
    .map(([key, value]) => `${key}="${value}"`)
    .join(' ');

  const text = block.text ? block.text.toString() : '';
  const children = block.children
    .map(child => blockToTemplate(child, indent + '  '))
    .join('\n');

  const tagName = `affine-${block.flavour}`;
  const propsStr = props ? ` ${props}` : '';
  const content = text
    ? `>${text}</${tagName}>`
    : children
      ? `>\n${children}\n${indent}</${tagName}>`
      : `></${tagName}>`;

  return `${indent}<${tagName}${propsStr}${content}`;
}

function docToTemplate(doc: Store): string {
  if (!doc.root) return 'null';
  const rootBlock = doc.getBlock(doc.root.id);
  if (!rootBlock) return 'null';
  return blockToTemplate(rootBlock.model);
}

function compareBlocks(
  actual: BlockModel,
  expected: BlockModel,
  compareId: boolean = false
): boolean {
  if (actual.flavour !== expected.flavour) return false;
  if (compareId && actual.id !== expected.id) return false;
  if (actual.children.length !== expected.children.length) return false;

  const actualText = actual.text;
  const expectedText = expected.text;
  if (
    actualText &&
    expectedText &&
    actualText.toString() !== expectedText.toString()
  ) {
    return false;
  }

  const actualProps = { ...actual.props };
  const expectedProps = { ...expected.props };

  if (JSON.stringify(actualProps) !== JSON.stringify(expectedProps))
    return false;

  for (const [i, child] of actual.children.entries()) {
    if (!compareBlocks(child, expected.children[i], compareId)) return false;
  }

  return true;
}

function compareDocs(
  actual: Store,
  expected: Store,
  compareId: boolean = false
): boolean {
  if (!actual.root || !expected.root) return false;

  const actualRoot = actual.getBlock(actual.root.id);
  const expectedRoot = expected.getBlock(expected.root.id);

  if (!actualRoot || !expectedRoot) return false;

  return compareBlocks(actualRoot.model, expectedRoot.model, compareId);
}

expect.extend({
  toEqualDoc(
    received: Store,
    expected: Store,
    options: { compareId?: boolean } = { compareId: false }
  ) {
    const compareId = options.compareId;
    const pass = compareDocs(received, expected, compareId);

    if (pass) {
      return {
        message: () => 'expected documents to be different',
        pass: true,
      };
    } else {
      const actualTemplate = docToTemplate(received);
      const expectedTemplate = docToTemplate(expected);

      return {
        message: () =>
          `Documents are not equal.\n\nActual:\n${actualTemplate}\n\nExpected:\n${expectedTemplate}`,
        pass: false,
      };
    }
  },
});
