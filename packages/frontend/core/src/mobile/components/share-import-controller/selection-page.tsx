import { Button, SafeArea, Scrollable } from '@affine/component';

import { PageHeader } from '../page-header';
import * as styles from './style.css';

export interface SelectionPageOption {
  id: string;
  label: string;
  detail?: string;
  color?: string;
}

export const SelectionPage = ({
  title,
  options,
  selectedIds,
  multiple = false,
  onBack,
  onSelect,
  onConfirm,
}: {
  title: string;
  options: SelectionPageOption[];
  selectedIds: string[];
  multiple?: boolean;
  onBack: () => void;
  onSelect: (id: string) => void;
  onConfirm?: () => void;
}) => {
  return (
    <div className={styles.page}>
      <PageHeader back backAction={onBack}>
        <span className={styles.headerTitle}>{title}</span>
      </PageHeader>
      <Scrollable.Root className={styles.scrollArea}>
        <Scrollable.Scrollbar />
        <Scrollable.Viewport>
          <ul className={styles.selectionList}>
            {options.map(option => {
              const selected = selectedIds.includes(option.id);
              return (
                <li key={option.id}>
                  <button
                    className={styles.selectionRow}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => onSelect(option.id)}
                  >
                    {option.color ? (
                      <span
                        className={styles.colorDot}
                        style={{ backgroundColor: option.color }}
                      />
                    ) : null}
                    <span className={styles.selectionLabel}>
                      {option.label}
                      {option.detail ? (
                        <span className={styles.selectionDetail}>
                          {option.detail}
                        </span>
                      ) : null}
                    </span>
                    {selected ? (
                      <span className={styles.checkmark} aria-hidden="true">
                        ✓
                      </span>
                    ) : (
                      <span
                        className={styles.checkmarkPlaceholder}
                        aria-hidden="true"
                      />
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </Scrollable.Viewport>
      </Scrollable.Root>
      {multiple ? (
        <SafeArea bottom className={styles.footer}>
          <Button
            className={styles.action}
            variant="primary"
            onClick={onConfirm}
          >
            Done
          </Button>
        </SafeArea>
      ) : null}
    </div>
  );
};
