import { useTranslation } from 'react-i18next';
export const useMacKeyboardShortcuts = () => {
  const { t } = useTranslation();
  return {
    [t('Undo')]: '⌘+Z',
    [t('Redo')]: '⌘+⇧+Z',
    [t('Bold')]: '⌘+B',
    [t('Italic')]: '⌘+I',
    [t('Underline')]: '⌘+U',
    [t('Strikethrough')]: '⌘+⇧+S',
    [t('Inline code')]: ' ⌘+E',
    [t('Code block')]: '⌘+⌥+C',
    [t('Link')]: '⌘+K',
    [t('Body text')]: '⌘+⌥+0',
    [t('Heading', { number: '1' })]: '⌘+⌥+1',
    [t('Heading', { number: '2' })]: '⌘+⌥+2',
    [t('Heading', { number: '3' })]: '⌘+⌥+3',
    [t('Heading', { number: '4' })]: '⌘+⌥+4',
    [t('Heading', { number: '5' })]: '⌘+⌥+5',
    [t('Heading', { number: '6' })]: '⌘+⌥+6',
    [t('Increase indent')]: 'Tab',
    [t('Reduce indent')]: '⇧+Tab',
  };
};

export const useMacMarkdownShortcuts = () => {
  const { t } = useTranslation();
  return {
    [t('Bold')]: '**Text** ',
    [t('Italic')]: '*Text* ',
    [t('Underline')]: '~Text~ ',
    [t('Strikethrough')]: '~~Text~~ ',
    [t('Divider')]: '***',
    [t('Inline code')]: '`Text` ',
    [t('Code block')]: '``` Space',
    [t('Heading', { number: '1' })]: '# Text',
    [t('Heading', { number: '2' })]: '## Text',
    [t('Heading', { number: '3' })]: '### Text',
    [t('Heading', { number: '4' })]: '#### Text',
    [t('Heading', { number: '5' })]: '##### Text',
    [t('Heading', { number: '6' })]: '###### Text',
  };
};

export const useWindowsKeyboardShortcuts = () => {
  const { t } = useTranslation();
  return {
    [t('Undo')]: 'Ctrl+Z',
    [t('Redo')]: 'Ctrl+Y',
    [t('Bold')]: 'Ctrl+B',
    [t('Italic')]: 'Ctrl+I',
    [t('Underline')]: 'Ctrl+U',
    [t('Strikethrough')]: 'Ctrl+Shift+S',
    [t('Inline code')]: ' Ctrl+E',
    [t('Code block')]: 'Ctrl+Alt+C',
    [t('Link')]: 'Ctrl+K',
    [t('Body text')]: 'Ctrl+Shift+0',
    [t('Heading', { number: '1' })]: 'Ctrl+Shift+1',
    [t('Heading', { number: '2' })]: 'Ctrl+Shift+2',
    [t('Heading', { number: '3' })]: 'Ctrl+Shift+3',
    [t('Heading', { number: '4' })]: 'Ctrl+Shift+4',
    [t('Heading', { number: '5' })]: 'Ctrl+Shift+5',
    [t('Heading', { number: '6' })]: 'Ctrl+Shift+6',
    [t('Increase indent')]: 'Tab',
    [t('Reduce indent')]: 'Shift+Tab',
  };
};
export const useWinMarkdownShortcuts = () => {
  const { t } = useTranslation();
  return {
    [t('Bold')]: '**Text** ',
    [t('Italic')]: '*Text* ',
    [t('Underline')]: '~Text~ ',
    [t('Strikethrough')]: '~~Text~~ ',
    [t('Divider')]: '***',
    [t('Inline code')]: '`Text` ',
    [t('Code block')]: '``` Text',
    [t('Heading', { number: '1' })]: '# Text',
    [t('Heading', { number: '2' })]: '## Text',
    [t('Heading', { number: '3' })]: '### Text',
    [t('Heading', { number: '4' })]: '#### Text',
    [t('Heading', { number: '5' })]: '##### Text',
    [t('Heading', { number: '6' })]: '###### Text',
  };
};
