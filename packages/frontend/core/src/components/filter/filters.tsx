import type { FilterParams } from '@affine/core/modules/collection-rules';
import clsx from 'clsx';

import { AddFilter } from './add-filter';
import { Filter } from './filter';
import * as styles from './styles.css';

export const Filters = ({
  filters,
  className,
  onChange,
}: {
  filters: FilterParams[];
  className?: string;
  onChange?: (filters: FilterParams[]) => void;
}) => {
  const handleDelete = (index: number) => {
    onChange?.(filters.filter((_, i) => i !== index));
  };

  const handleChange = (index: number, filter: FilterParams) => {
    onChange?.(filters.map((f, i) => (i === index ? filter : f)));
  };

  return (
    <div className={clsx(styles.container, className)}>
      {filters.map((filter, index) => {
        return (
          <Filter
            // oxlint-disable-next-line no-array-index-key
            key={index}
            filter={filter}
            onDelete={() => {
              handleDelete(index);
            }}
            onChange={filter => {
              handleChange(index, filter);
            }}
          />
        );
      })}
      <AddFilter
        onAdd={filter => {
          onChange?.(filters.concat(filter));
        }}
      />
    </div>
  );
};
