import { getOrCreateI18n } from '@affine/i18n';

export function translateEditorLabel(label: string) {
  const arrow = /^arrow-(\d+)$/.exec(label);
  if (arrow) {
    return getOrCreateI18n().t('com.affine.edgeless.sticker.numbered-arrow', {
      number: arrow[1],
    });
  }
  return getOrCreateI18n().t(`com.affine.edgeless.label.${label}`, {
    defaultValue: label,
    keySeparator: false,
    nsSeparator: false,
  });
}
