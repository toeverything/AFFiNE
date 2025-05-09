import process from 'node:process';

const editorIndex = {
  0: 0,
  1: 1,
}[process.env.MULTIPLE_EDITOR_INDEX ?? ''];
export const scope =
  editorIndex == null
    ? undefined
    : editorIndex === 0
      ? 'FIRST | '
      : 'SECOND | ';
export const multiEditor = scope != null;

export const currentEditorIndex = editorIndex ?? 0;
