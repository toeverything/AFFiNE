import { useAFFiNEI18N } from '@affine/i18n/hooks';

type FilterTagProps = {
  name: string;
};

export const FilterTag = ({ name }: FilterTagProps) => {
  const t = useAFFiNEI18N();
  switch (name) {
    case 'Created':
      return t['Created']();
    case 'Updated':
      return t['Updated']();
    case 'Tags':
      return t['Tags']();
    case 'Is Favourited':
      return t['com.affine.filter.is-favourited']();
    case 'after':
      return t['com.affine.filter.after']();
    case 'before':
      return t['com.affine.filter.before']();
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
