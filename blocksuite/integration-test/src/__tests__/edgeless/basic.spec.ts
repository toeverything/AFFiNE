import { LocalShapeElementModel } from '@blocksuite/affine-model';
import { Text } from '@blocksuite/store';
import { beforeEach, describe, expect, test } from 'vitest';

import { addNote, getSurface } from '../utils/edgeless.js';
import { setupEditor } from '../utils/setup.js';

beforeEach(async () => {
  const cleanup = await setupEditor('edgeless');

  return cleanup;
});

test('basic assert', () => {
  expect(window.doc).toBeDefined();
  expect(window.editor).toBeDefined();
  expect(window.editor.mode).toBe('edgeless');

  expect(getSurface(window.doc, window.editor)).toBeDefined();
});

describe('doc / note empty checker', () => {
  test('a paragraph is empty if it dose not contain text and child blocks', () => {
    const noteId = addNote(doc);
    const paragraphId = doc.addBlock('affine:paragraph', {}, noteId);
    const paragraph = doc.getBlock(paragraphId)?.model;
    expect(paragraph?.isEmpty()).toBe(true);
  });

  test('a paragraph is not empty if it contains text', () => {
    const noteId = addNote(doc);
    const paragraphId = doc.addBlock(
      'affine:paragraph',
      {
        text: new Text('hello'),
      },
      noteId
    );
    const paragraph = doc.getBlock(paragraphId)?.model;
    expect(paragraph?.isEmpty()).toBe(false);
  });

  test('a paragraph is not empty if it contains children blocks', () => {
    const noteId = addNote(doc);
    const paragraphId = doc.addBlock('affine:paragraph', {}, noteId);
    const paragraph = doc.getBlock(paragraphId)?.model;

    // sub paragraph
    doc.addBlock('affine:paragraph', {}, paragraphId);
    expect(paragraph?.isEmpty()).toBe(false);
  });

  test('a note is empty if it dose not contain any blocks', () => {
    const noteId = addNote(doc);
    const note = doc.getBlock(noteId)!.model;
    note.children.forEach(child => {
      doc.deleteBlock(child);
    });
    expect(note.children.length).toBe(0);
    expect(note.isEmpty()).toBe(true);
  });

  test('a note is empty if it only contains a empty paragraph', () => {
    // `addNote` will create a empty paragraph
    const noteId = addNote(doc);
    const note = doc.getBlock(noteId)!.model;
    expect(note.isEmpty()).toBe(true);
  });

  test('a note is not empty if it contains multi blocks', () => {
    const noteId = addNote(doc);
    const note = doc.getBlock(noteId)!.model;
    doc.addBlock('affine:paragraph', {}, noteId);
    expect(note.isEmpty()).toBe(false);
  });

  test('a surface is empty if it dose not contains any element or blocks', () => {
    const surface = getSurface(doc, editor).model;
    expect(surface.isEmpty()).toBe(true);

    const shapeId = surface.addElement({
      type: 'shape',
    });
    expect(surface.isEmpty()).toBe(false);
    surface.deleteElement(shapeId);
    expect(surface.isEmpty()).toBe(true);

    const frameId = doc.addBlock('affine:frame', {}, surface.id);
    const frame = doc.getBlock(frameId)!.model;
    expect(surface.isEmpty()).toBe(false);
    doc.deleteBlock(frame);
    expect(surface.isEmpty()).toBe(true);
  });

  test('a surface is empty if it only contains local elements', () => {
    const surface = getSurface(doc, editor).model;
    const localShape = new LocalShapeElementModel(surface);
    surface.addLocalElement(localShape);
    expect(surface.isEmpty()).toBe(true);
  });

  test('a just initialized doc is empty', () => {
    expect(doc.isEmpty).toBe(true);
    expect(editor.rootModel.isEmpty()).toBe(true);
  });

  test('a doc is empty if it only contains a note', () => {
    addNote(doc);
    expect(doc.isEmpty).toBe(true);

    addNote(doc);
    expect(
      doc.isEmpty,
      'a doc is not empty if it contains multi-notes'
    ).toBeFalsy();
  });

  test('a note is empty if its children array is empty', () => {
    const noteId = addNote(doc);
    const note = doc.getBlock(noteId)?.model;
    note?.children.forEach(child => doc.deleteBlock(child));
    expect(note?.children.length === 0).toBe(true);
    expect(note?.isEmpty()).toBe(true);
  });

  test('a doc is empty if its only contains an empty note and an empty surface', () => {
    const noteId = addNote(doc);
    const note = doc.getBlock(noteId)!.model;
    expect(doc.isEmpty).toBe(true);

    const newNoteId = addNote(doc);
    const newNote = doc.getBlock(newNoteId)!.model;
    expect(doc.isEmpty).toBe(false);
    doc.deleteBlock(newNote);
    expect(doc.isEmpty).toBe(true);

    const newParagraphId = doc.addBlock('affine:paragraph', {}, note);
    const newParagraph = doc.getBlock(newParagraphId)!.model;
    expect(doc.isEmpty).toBe(false);
    doc.deleteBlock(newParagraph);
    expect(doc.isEmpty).toBe(true);

    const surface = getSurface(doc, editor).model;
    expect(doc.isEmpty).toBe(true);

    const shapeId = surface.addElement({
      type: 'shape',
    });
    expect(doc.isEmpty).toBe(false);
    surface.deleteElement(shapeId);
    expect(doc.isEmpty).toBe(true);
  });
});
