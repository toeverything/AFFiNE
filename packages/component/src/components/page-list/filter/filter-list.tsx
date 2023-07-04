import type { Filter } from '@affine/env/filter';
import type { PropertiesMeta } from '@affine/env/filter';
import { CloseIcon, PlusIcon } from '@blocksuite/icons';

import { Menu } from '../../..';
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
  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 10,
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
        trigger={'click'}
        content={
          <CreateFilterMenu
            value={value}
            onChange={onChange}
            propertiesMeta={propertiesMeta}
          />
        }
      >
        <div
          style={{
            cursor: 'pointer',
            padding: 4,
            marginLeft: 4,
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <PlusIcon />
        </div>
      </Menu>
    </div>
  );
};
