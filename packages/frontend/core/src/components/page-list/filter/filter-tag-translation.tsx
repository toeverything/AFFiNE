import { Tooltip } from '@affine/component';
import { useI18n } from '@affine/i18n';

import { ellipsisTextStyle } from './index.css';
type FilterTagProps = {
  name: string;
};

const useFilterTag = ({ name }: FilterTagProps) => {
  const t = useI18n();
  switch (name) {
    case 'Created':
      return t['Created']();
    case 'Updated':
      return t['Updated']();
    case 'Tags':
      return t['Tags']();
    case 'Is Favourited':
      return t['com.affine.filter.is-favourited']();
    case 'Is Public':
      return t['com.affine.filter.is-public']();
    case 'after':
      return t['com.affine.filter.after']();
    case 'before':
      return t['com.affine.filter.before']();
    case 'last':
      return t['com.affine.filter.last']();
    case 'is':
      return t['com.affine.filter.is']();
    case 'is not empty':
      return t['com.affine.filter.is not empty']();
    case 'is empty':
      return t['com.affine.filter.is empty']();
    case 'contains all':
      return t['com.affine.filter.contains all']();
    case 'contains one of':
      return t['com.affine.filter.contains one of']();
    case 'does not contains all':
      return t['com.affine.filter.does not contains all']();
    case 'does not contains one of':
      return t['com.affine.filter.does not contains one of']();
    case 'true':
      return t['com.affine.filter.true']();
    case 'false':
      return t['com.affine.filter.false']();
    default:
      return name;
  }
};

export const FilterTag = ({ name }: FilterTagProps) => {
  const tag = useFilterTag({ name });

  return (
    <Tooltip content={tag}>
      <span className={ellipsisTextStyle} data-testid={`filler-tag-${tag}`}>
        {tag}
      </span>
    </Tooltip>
  );
};
