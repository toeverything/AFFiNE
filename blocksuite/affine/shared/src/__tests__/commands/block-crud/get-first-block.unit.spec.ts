/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it } from 'vitest';

import { getFirstBlockCommand } from '../../../commands/block-crud/get-first-content-block';
import { affine } from '../../../test-utils';

describe('commands/block-crud', () => {
  describe('getFirstBlockCommand', () => {
    it('should return null when root is not exists', () => {
      const host = affine`<affine-page></affine-page>`;

      const [_, { firstBlock }] = host.command.exec(getFirstBlockCommand, {
        role: 'content',
        root: undefined,
      });

      expect(firstBlock).toBeNull();
    });

    it('should return first block with content role when found', () => {
      const host = affine`
        <affine-page>
          <affine-note id="note-1">
            <affine-paragraph id="paragraph-1-1">First Paragraph</affine-paragraph>
            <affine-paragraph id="paragraph-1-2">Second Paragraph</affine-paragraph>
          </affine-note>
          <affine-note id="note-2">
            <affine-paragraph id="paragraph-2-1">First Paragraph</affine-paragraph>
            <affine-paragraph id="paragraph-2-2">Second Paragraph</affine-paragraph>
          </affine-note>
        </affine-page>
      `;

      const [_, { firstBlock }] = host.command.exec(getFirstBlockCommand, {
        role: 'hub',
        root: undefined,
      });

      expect(firstBlock?.id).toBe('note-1');
    });

    it('should return first block with any role in the array when found', () => {
      const host = affine`
        <affine-page>
          <affine-note id="note-1">
            <affine-paragraph id="paragraph-1-1">First Paragraph</affine-paragraph>
            <affine-paragraph id="paragraph-1-2">Second Paragraph</affine-paragraph>
          </affine-note>
          <affine-note id="note-2">
            <affine-paragraph id="paragraph-2-1">First Paragraph</affine-paragraph>
            <affine-paragraph id="paragraph-2-2">Second Paragraph</affine-paragraph>
          </affine-note>
        </affine-page>
      `;

      const [_, { firstBlock }] = host.command.exec(getFirstBlockCommand, {
        role: ['hub', 'content'],
        root: undefined,
      });

      expect(firstBlock?.id).toBe('note-1');
    });

    it('should return first block with specified flavour when found', () => {
      const host = affine`
        <affine-page>
          <affine-note id="note-1">
            <affine-paragraph id="paragraph-1">Paragraph</affine-paragraph>
            <affine-list id="list-1">List Item</affine-list>
          </affine-note>
        </affine-page>
      `;

      const note = host.store.getBlock('note-1')?.model;

      const [_, { firstBlock }] = host.command.exec(getFirstBlockCommand, {
        flavour: 'affine:list',
        root: note,
      });

      expect(firstBlock?.id).toBe('list-1');
    });

    it('should return first block with any flavour in the array when found', () => {
      const host = affine`
        <affine-page>
          <affine-note id="note-1">
            <affine-paragraph id="paragraph-1">Paragraph</affine-paragraph>
            <affine-list id="list-1">List Item</affine-list>
          </affine-note>
        </affine-page>
      `;

      const note = host.store.getBlock('note-1')?.model;

      const [_, { firstBlock }] = host.command.exec(getFirstBlockCommand, {
        flavour: ['affine:list', 'affine:code'],
        root: note,
      });

      expect(firstBlock?.id).toBe('list-1');
    });

    it('should return first block matching both role and flavour when both specified', () => {
      const host = affine`
        <affine-page>
          <affine-note id="note-1">
            <affine-paragraph id="paragraph-1">Content Paragraph</affine-paragraph>
            <affine-list id="list-1">Content List</affine-list>
            <affine-paragraph id="paragraph-2">hub Paragraph</affine-paragraph>
          </affine-note>
        </affine-page>
      `;

      const note = host.store.getBlock('note-1')?.model;
      const [_, { firstBlock }] = host.command.exec(getFirstBlockCommand, {
        role: 'content',
        flavour: 'affine:list',
        root: note,
      });

      expect(firstBlock?.id).toBe('list-1');
    });

    it('should return first block with default roles when role not specified', () => {
      const host = affine`
        <affine-page>
          <affine-note id="note-1">
            <affine-paragraph id="paragraph-1">hub Paragraph</affine-paragraph>
            <affine-paragraph id="paragraph-2">Content Paragraph</affine-paragraph>
            <affine-paragraph id="paragraph-3">Hub Paragraph</affine-paragraph>
          </affine-note>
        </affine-page>
      `;

      const [_, { firstBlock }] = host.command.exec(getFirstBlockCommand, {
        root: undefined,
      });

      expect(firstBlock?.id).toBe('note-1');
    });

    it('should return first block with specified role when found', () => {
      const host = affine`
        <affine-page>
          <affine-note id="note-1">
            <affine-paragraph id="paragraph-1">Content Paragraph</affine-paragraph>
            <affine-paragraph id="paragraph-2">hub Paragraph</affine-paragraph>
            <affine-database id="database-1">Database</affine-database>
          </affine-note>
        </affine-page>
      `;

      const note = host.store.getBlock('note-1')?.model;

      const [_, { firstBlock }] = host.command.exec(getFirstBlockCommand, {
        role: 'hub',
        root: note,
      });

      expect(firstBlock?.id).toBe('database-1');
    });

    it('should return null when no blocks with specified role are found in children', () => {
      const host = affine`
        <affine-page>
          <affine-note id="note-1">
            <affine-paragraph id="paragraph-1">Content Paragraph</affine-paragraph>
            <affine-paragraph id="paragraph-2">Another Content Paragraph</affine-paragraph>
          </affine-note>
        </affine-page>
      `;

      const note = host.store.getBlock('note-1')?.model;

      const [_, { firstBlock }] = host.command.exec(getFirstBlockCommand, {
        role: 'hub',
        root: note,
      });

      expect(firstBlock).toBeNull();
    });

    it('should return null when no blocks with specified flavour are found in children', () => {
      const host = affine`
        <affine-page>
          <affine-note id="note-1">
            <affine-paragraph id="paragraph-1">Paragraph</affine-paragraph>
            <affine-paragraph id="paragraph-2">Another Paragraph</affine-paragraph>
          </affine-note>
        </affine-page>
      `;

      const note = host.store.getBlock('note-1')?.model;

      const [_, { firstBlock }] = host.command.exec(getFirstBlockCommand, {
        flavour: 'affine:list',
        root: note,
      });

      expect(firstBlock).toBeNull();
    });

    it('should return first block with specified role within specified root subtree', () => {
      const host = affine`
        <affine-page>
          <affine-note id="note-1">
            <affine-paragraph id="paragraph-1-1">1-1 Content</affine-paragraph>
            <affine-paragraph id="paragraph-1-2">1-2 hub</affine-paragraph>
          </affine-note>
          <affine-note id="note-2">
            <affine-paragraph id="paragraph-2-1">2-1 hub</affine-paragraph>
            <affine-paragraph id="paragraph-2-2">2-2 Content</affine-paragraph>
          </affine-note>
        </affine-page>
      `;

      const note = host.store.getBlock('note-2')?.model;

      const [_, { firstBlock }] = host.command.exec(getFirstBlockCommand, {
        role: 'content',
        root: note,
      });

      expect(firstBlock?.id).toBe('paragraph-2-1');
    });
  });
});
