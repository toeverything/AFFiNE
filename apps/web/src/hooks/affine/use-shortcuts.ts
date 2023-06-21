import { env } from '@affine/env';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { useMemo } from 'react';

interface ShortcutTip {
  [x: string]: string;
}

export const useWinGeneralKeyboardShortcuts = (): ShortcutTip => {
  const t = useAFFiNEI18N();
  return useMemo(
    () => ({
      [t['Cancel']()]: 'ESC',
      [t['Quick Search']()]: 'Ctrl + K',
      [t['New Page']()]: 'Ctrl + N',
      // not implement yet
      // [t['Append to Daily Note']()]: 'Ctrl + Alt + A',
      [t['Expand/Collapse Sidebar']()]: 'Ctrl + /',
      // not implement yet
      // [t['Go Back']()]: 'Ctrl + [',
      // [t['Go Forward']()]: 'Ctrl + ]',
    }),
    [t]
  );
};
export const useMacGeneralKeyboardShortcuts = (): ShortcutTip => {
  const t = useAFFiNEI18N();
  return useMemo(
    () => ({
      [t['Cancel']()]: 'ESC',
      [t['Quick Search']()]: '⌘ + K',
      [t['New Page']()]: '⌘ + N',
      // not implement yet
      // [t['Append to Daily Note']()]: '⌘ + ⌥ + A',
      [t['Expand/Collapse Sidebar']()]: '⌘ + /',
      // not implement yet
      // [t['Go Back']()]: '⌘ + [',
      // [t['Go Forward']()]: '⌘ + ]',
    }),
    [t]
  );
};

export const useMacEdgelessKeyboardShortcuts = (): ShortcutTip => {
  const t = useAFFiNEI18N();
  return useMemo(
    () => ({
      [t['Select All']()]: '⌘ + A',
      [t['Undo']()]: '⌘ + Z',
      [t['Redo']()]: '⌘ + ⇧ + Z',
      [t['Zoom in']()]: '⌘ + +',
      [t['Zoom out']()]: '⌘ + -',
      [t['Zoom to 100%']()]: '⌘ + 0',
      [t['Zoom to fit']()]: '⌘ + 1',
      [t['Select']()]: 'V',
      [t['Text']()]: 'T',
      [t['Shape']()]: 'S',
      [t['Image']()]: 'I',
      [t['Straight Connector']()]: 'L',
      [t['Elbowed Connector']()]: 'X',
      // not implement yet
      // [t['Curve Connector']()]: 'C',
      [t['Pen']()]: 'P',
      [t['Hand']()]: 'H',
      [t['Note']()]: 'N',
      // not implement yet
      // [t['Group']()]: '⌘ + G',
      // [t['Ungroup']()]: '⌘ + ⇧ + G',
    }),
    [t]
  );
};
export const useWinEdgelessKeyboardShortcuts = (): ShortcutTip => {
  const t = useAFFiNEI18N();
  return useMemo(
    () => ({
      [t['Select All']()]: 'Ctrl + A',
      [t['Undo']()]: 'Ctrl + Z',
      [t['Redo']()]: 'Ctrl + Y/Ctrl + Shift + Z',
      [t['Zoom in']()]: 'Ctrl + +',
      [t['Zoom out']()]: 'Ctrl + -',
      [t['Zoom to 100%']()]: 'Ctrl + 0',
      [t['Zoom to fit']()]: 'Ctrl + 1',
      [t['Select']()]: 'V',
      [t['Text']()]: 'T',
      [t['Shape']()]: 'S',
      [t['Image']()]: 'I',
      [t['Straight Connector']()]: 'L',
      [t['Elbowed Connector']()]: 'X',
      // not implement yet
      // [t['Curve Connector']()]: 'C',
      [t['Pen']()]: 'P',
      [t['Hand']()]: 'H',
      [t['Note']()]: 'N',
      // not implement yet
      // [t['Group']()]: 'Ctrl + G',
      // [t['Ungroup']()]: 'Ctrl + Shift + G',
    }),
    [t]
  );
};
export const useMacPageKeyboardShortcuts = (): ShortcutTip => {
  const t = useAFFiNEI18N();
  return useMemo(
    () => ({
      [t['Undo']()]: '⌘+Z',
      [t['Redo']()]: '⌘+⇧+Z',
      [t['Bold']()]: '⌘+B',
      [t['Italic']()]: '⌘+I',
      [t['Underline']()]: '⌘+U',
      [t['Strikethrough']()]: '⌘+⇧+S',
      [t['Inline code']()]: ' ⌘+E',
      [t['Code block']()]: '⌘+⌥+C',
      [t['Link']()]: '⌘+K',
      [t['Quick search']()]: '⌘+K',
      [t['Body text']()]: '⌘+⌥+0',
      [t['Heading']({ number: '1' })]: '⌘+⌥+1',
      [t['Heading']({ number: '2' })]: '⌘+⌥+2',
      [t['Heading']({ number: '3' })]: '⌘+⌥+3',
      [t['Heading']({ number: '4' })]: '⌘+⌥+4',
      [t['Heading']({ number: '5' })]: '⌘+⌥+5',
      [t['Heading']({ number: '6' })]: '⌘+⌥+6',
      [t['Increase indent']()]: 'Tab',
      [t['Reduce indent']()]: '⇧+Tab',
      [t['Group as Database']()]: '⌘ + G',
      // not implement yet
      // [t['Move Up']()]: '⌘ + ⌥ + ↑',
      // [t['Move Down']()]: '⌘ + ⌥ + ↓',
    }),
    [t]
  );
};

export const useMacMarkdownShortcuts = (): ShortcutTip => {
  const t = useAFFiNEI18N();
  return useMemo(
    () => ({
      [t['Bold']()]: '**Text** ',
      [t['Italic']()]: '*Text* ',
      [t['Underline']()]: '~Text~ ',
      [t['Strikethrough']()]: '~~Text~~ ',
      [t['Divider']()]: '***',
      [t['Inline code']()]: '`Text` ',
      [t['Code block']()]: '``` Space',
      [t['Heading']({ number: '1' })]: '# Text',
      [t['Heading']({ number: '2' })]: '## Text',
      [t['Heading']({ number: '3' })]: '### Text',
      [t['Heading']({ number: '4' })]: '#### Text',
      [t['Heading']({ number: '5' })]: '##### Text',
      [t['Heading']({ number: '6' })]: '###### Text',
    }),
    [t]
  );
};

export const useWinPageKeyboardShortcuts = (): ShortcutTip => {
  const t = useAFFiNEI18N();
  return useMemo(
    () => ({
      [t['Undo']()]: 'Ctrl+Z',
      [t['Redo']()]: 'Ctrl+Y',
      [t['Bold']()]: 'Ctrl+B',
      [t['Italic']()]: 'Ctrl+I',
      [t['Underline']()]: 'Ctrl+U',
      [t['Strikethrough']()]: 'Ctrl+Shift+S',
      [t['Inline code']()]: ' Ctrl+E',
      [t['Code block']()]: 'Ctrl+Alt+C',
      [t['Link']()]: 'Ctrl+K',
      [t['Quick search']()]: 'Ctrl+K',
      [t['Body text']()]: 'Ctrl+Shift+0',
      [t['Heading']({ number: '1' })]: 'Ctrl+Shift+1',
      [t['Heading']({ number: '2' })]: 'Ctrl+Shift+2',
      [t['Heading']({ number: '3' })]: 'Ctrl+Shift+3',
      [t['Heading']({ number: '4' })]: 'Ctrl+Shift+4',
      [t['Heading']({ number: '5' })]: 'Ctrl+Shift+5',
      [t['Heading']({ number: '6' })]: 'Ctrl+Shift+6',
      [t['Increase indent']()]: 'Tab',
      [t['Reduce indent']()]: 'Shift+Tab',
      [t['Group as Database']()]: 'Ctrl + G',
      // not implement yet
      // [t['Move Up']()]: 'Ctrl + Alt + ↑',
      // [t['Move Down']()]: 'Ctrl + Alt + ↓',
    }),
    [t]
  );
};
export const useWinMarkdownShortcuts = (): ShortcutTip => {
  const t = useAFFiNEI18N();
  return useMemo(
    () => ({
      [t['Bold']()]: '**Text** ',
      [t['Italic']()]: '*Text* ',
      [t['Underline']()]: '~Text~ ',
      [t['Strikethrough']()]: '~~Text~~ ',
      [t['Divider']()]: '***',
      [t['Inline code']()]: '`Text` ',
      [t['Code block']()]: '``` Text',
      [t['Heading']({ number: '1' })]: '# Text',
      [t['Heading']({ number: '2' })]: '## Text',
      [t['Heading']({ number: '3' })]: '### Text',
      [t['Heading']({ number: '4' })]: '#### Text',
      [t['Heading']({ number: '5' })]: '##### Text',
      [t['Heading']({ number: '6' })]: '###### Text',
    }),
    [t]
  );
};

export const useMarkdownShortcuts = (): ShortcutTip => {
  const macMarkdownShortcuts = useMacMarkdownShortcuts();
  const winMarkdownShortcuts = useWinMarkdownShortcuts();
  const isMac = env.isBrowser && env.isMacOs;
  return isMac ? macMarkdownShortcuts : winMarkdownShortcuts;
};

export const usePageShortcuts = (): ShortcutTip => {
  const macPageShortcuts = useMacPageKeyboardShortcuts();
  const winPageShortcuts = useWinPageKeyboardShortcuts();
  const isMac = env.isBrowser && env.isMacOs;
  return isMac ? macPageShortcuts : winPageShortcuts;
};

export const useEdgelessShortcuts = (): ShortcutTip => {
  const macEdgelessShortcuts = useMacEdgelessKeyboardShortcuts();
  const winEdgelessShortcuts = useWinEdgelessKeyboardShortcuts();
  const isMac = env.isBrowser && env.isMacOs;

  return isMac ? macEdgelessShortcuts : winEdgelessShortcuts;
};

export const useGeneralShortcuts = (): ShortcutTip => {
  const macGeneralShortcuts = useMacGeneralKeyboardShortcuts();
  const winGeneralShortcuts = useWinGeneralKeyboardShortcuts();
  const isMac = env.isBrowser && env.isMacOs;

  return isMac ? macGeneralShortcuts : winGeneralShortcuts;
};
