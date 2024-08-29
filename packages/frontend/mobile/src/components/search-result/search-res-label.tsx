import type { QuickSearchItem } from '@affine/core/modules/quicksearch';
import { HighlightText } from '@affine/core/modules/quicksearch/views/highlight-text';
import { isI18nString, useI18n } from '@affine/i18n';

export interface SearchResLabelProps {
  item: QuickSearchItem;
}
export const SearchResLabel = ({ item }: SearchResLabelProps) => {
  const i18n = useI18n();

  const text = !isI18nString(item.label)
    ? i18n.t(item.label.title)
    : i18n.t(item.label);
  return <HighlightText text={text} start="<b>" end="</b>" />;
};
