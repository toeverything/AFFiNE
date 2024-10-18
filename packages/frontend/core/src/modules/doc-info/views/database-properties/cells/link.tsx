import { PropertyValue } from '@affine/component';

import type { DatabaseCellRendererProps } from '../../../types';

export const LinkCell = ({ cell }: DatabaseCellRendererProps) => {
  const isEmpty = typeof cell.value !== 'string' || !cell.value;
  const link = cell.value as string;
  // todo(pengx17): support edit
  return (
    <PropertyValue isEmpty={isEmpty}>
      <a href={link} target="_blank" rel="noopener noreferrer">
        {link.replace(/^https?:\/\//, '')}
      </a>
    </PropertyValue>
  );
};
