import { Button, IconButton, Menu } from '@affine/component';
import type { Filter, PropertiesMeta } from '@affine/env/filter';
import { useI18n } from '@affine/i18n';
import { CloseIcon, PlusIcon } from '@blocksuite/icons/rc';

import { Condition } from './condition';
import * as styles from './index.css';
import { CreateFilterMenu } from './vars';

export const FilterList = ({
  value,
  onChange,
  propertiesMeta,
}: {
  value: Filter[];
  onChange: (value: Filter[]) => void;
  propertiesMeta: PropertiesMeta;
}) => {
  const t = useI18n();
  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 10,
        alignItems: 'center',
      }}
    >
      {value.map((filter, i) => {
        return (
          <div className={styles.filterItemStyle} key={i}>
            <Condition
              propertiesMeta={propertiesMeta}
              value={filter}
              onChange={filter => {
                onChange(
                  value.map((old, oldIndex) => (oldIndex === i ? filter : old))
                );
              }}
            />
            <div
              className={styles.filterItemCloseStyle}
              onClick={() => {
                onChange(value.filter((_, index) => i !== index));
              }}
            >
              <CloseIcon />
            </div>
          </div>
        );
      })}
      <Menu
        key={value.length} // hack to force menu to rerender (disable unmount animation)
        items={
          <CreateFilterMenu
            value={value}
            onChange={onChange}
            propertiesMeta={propertiesMeta}
          />
        }
      >
        {value.length === 0 ? (
          <Button suffix={<PlusIcon />}>
            {t['com.affine.filterList.button.add']()}
          </Button>
        ) : (
          <IconButton size="16">
            <PlusIcon />
          </IconButton>
        )}
      </Menu>
    </div>
  );
};
