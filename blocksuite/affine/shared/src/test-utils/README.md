# AFFiNE Test Tools

## Structured Document Creation

`affine-template.ts` provides a concise way to create test documents, using a html-like syntax.

### Basic Usage

```typescript
import { affine } from '@blocksuite/affine-shared/test-utils';

// Create a simple document
const doc = affine`
  <affine-page>
    <affine-note>
      <affine-paragraph>Hello, World!</affine-paragraph>
    </affine-note>
  </affine-page>
`;
```

### Complex Structure Example

```typescript
// Create a document with multiple notes and paragraphs
const doc = affine`
  <affine-page title="My Test Page">
    <affine-note>
      <affine-paragraph>First paragraph</affine-paragraph>
      <affine-paragraph>Second paragraph</affine-paragraph>
    </affine-note>
    <affine-note>
      <affine-paragraph>Another note</affine-paragraph>
    </affine-note>
  </affine-page>
`;
```

### Application in Tests

This tool is particularly suitable for creating documents with specific structures in test cases:

```typescript
import { describe, expect, it } from 'vitest';
import { affine } from '../__tests__/utils/affine-template';

describe('My Test', () => {
  it('should correctly handle document structure', () => {
    const doc = affine`
      <affine-page>
        <affine-note>
          <affine-paragraph>Test content</affine-paragraph>
        </affine-note>
      </affine-page>
    `;

    // Get blocks
    const pages = doc.getBlocksByFlavour('affine:page');
    const notes = doc.getBlocksByFlavour('affine:note');
    const paragraphs = doc.getBlocksByFlavour('affine:paragraph');

    expect(pages.length).toBe(1);
    expect(notes.length).toBe(1);
    expect(paragraphs.length).toBe(1);

    // Perform more tests here...
  });
});
```

### Supported Block Types

Currently supports the following block types:

- `affine-page` → `affine:page`
- `affine-note` → `affine:note`
- `affine-paragraph` → `affine:paragraph`
- `affine-list` → `affine:list`
- `affine-image` → `affine:image`
