import { Menu } from '../../..';
import { Condition } from './condition';
import * as styles from './index.css';
import type { Filter } from './vars';
import { CreateFilterMenu } from './vars';
export const FilterList = ({
  value,
  onChange,
}: {
  value: Filter[];
  onChange: (value: Filter[]) => void;
}) => {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap' }}>
      {value.map((filter, i) => {
        return (
          <div className={styles.filterItemStyle} key={i}>
            <Condition
              value={filter}
              onChange={filter => {
                onChange(
                  value.map((old, oldIndex) => (oldIndex === i ? filter : old))
                );
              }}
            />
            <div
              style={{ marginLeft: 8, cursor: 'pointer' }}
              onClick={() => {
                onChange(value.filter((_, index) => i !== index));
              }}
            >
              x
            </div>
          </div>
        );
      })}
      <Menu
        trigger={'click'}
        content={<CreateFilterMenu value={value} onChange={onChange} />}
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
          +
        </div>
      </Menu>
    </div>
  );
};
