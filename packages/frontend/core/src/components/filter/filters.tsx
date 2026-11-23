import type { FilterParams } from '@affine/core/modules/collection-rules';
import clsx from 'clsx';
import { useCallback, useEffect, useRef, useState } from 'react';

import { AddFilter } from './add-filter';
import { Filter } from './filter';
import * as styles from './styles.css';

export const Filters = ({
  filters,
  className,
  onChange,
  defaultDraftFilter,
}: {
  filters: FilterParams[];
  className?: string;
  onChange?: (filters: FilterParams[]) => void;
  defaultDraftFilter?: FilterParams | null;
}) => {
  const [draftFilter, setDraftFilter] = useState<FilterParams | null>(
    defaultDraftFilter ?? null
  );

  // When draftChange and draftCompleted are triggered consecutively,
  // we might save an outdated draft filter value.
  // Using a ref helps us avoid this issue by always accessing the latest value.
  const draftFilterRef = useRef<FilterParams | null>(draftFilter);
  useEffect(() => {
    draftFilterRef.current = draftFilter;
  }, [draftFilter]);

  const handleDelete = (index: number) => {
    onChange?.(filters.filter((_, i) => i !== index));
  };

  const handleChange = (index: number, filter: FilterParams) => {
    onChange?.(filters.map((f, i) => (i === index ? filter : f)));
  };

  const handleDraftCompleted = useCallback(() => {
    if (draftFilterRef.current) {
      onChange?.(filters.concat(draftFilterRef.current));
      setDraftFilter(null);
    }
  }, [onChange, filters]);

  const handleAdd = useCallback((filter: FilterParams) => {
    // Add a small delay to ensure the previous menu is closed before opening the next one
    setTimeout(() => {
      setDraftFilter(filter);
    }, 50);
  }, []);

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
      {draftFilter && (
        <Filter
          filter={draftFilter}
          isDraft
          onDelete={() => {
            setDraftFilter(null);
          }}
          onChange={filter => {
            setDraftFilter(filter);
          }}
          onDraftCompleted={handleDraftCompleted}
        />
      )}

      <AddFilter
        variant={
          filters.length === 0 && draftFilter === null
            ? 'button'
            : 'icon-button'
        }
        onAdd={handleAdd}
      />
    </div>
  );
};
