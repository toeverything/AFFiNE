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
    case 'Is Favourited':
      return t['com.affine.filter.is-favourited']();
    case 'after':
      return t['com.affine.filter.after']();
    case 'before':
      return t['com.affine.filter.before']();
    case 'is':
      return t['com.affine.filter.is']();
    case 'true':
      return t['com.affine.filter.true']();
    case 'false':
      return t['com.affine.filter.false']();
    default:
      return name;
  }
};
