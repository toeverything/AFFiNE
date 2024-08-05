import { AfFiNeIcon } from '@blocksuite/icons/rc';
import type { Meta } from '@storybook/react';
import clsx from 'clsx';
import { type ReactElement, useCallback, useEffect, useState } from 'react';

import { Switch } from '../switch';
import * as styles from './button.stories.css';
import type { IconButtonProps } from './icon-button';
import { IconButton } from './icon-button';

export default {
  title: 'UI/IconButton',
  component: IconButton,
} satisfies Meta<IconButtonProps>;

const types: IconButtonProps['variant'][] = ['plain', 'solid', 'danger'];
const sizes: IconButtonProps['size'][] = ['12', '14', '16', '20', '24'];

const Groups = ({
  children,
  ...props
}: Omit<IconButtonProps, 'type' | 'size' | 'children'> & {
  children?: ReactElement;
}) => {
  return (
    <table className={styles.table}>
      <thead>
        <tr>
          <td>Type/Size</td>
          {sizes.map(size => (
            <td key={size}>{size}</td>
          ))}
        </tr>
      </thead>
      <tbody>
        {types.map(type => (
          <tr key={type}>
            <td>{type}</td>
            {sizes.map(size => (
              <td key={size}>
                <IconButton variant={type} size={size} {...props}>
                  {children ?? <AfFiNeIcon />}
                </IconButton>
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
};

export const Default = () => <Groups />;

export const Loading = () => {
  const [loading, setLoading] = useState(false);

  const toggleLoading = useCallback(() => setLoading(v => !v), []);

  useEffect(() => {
    setInterval(toggleLoading, 1000);
  }, [toggleLoading]);

  return <Groups loading={loading} />;
};

export const OverrideViaClassName = () => {
  const [overrideBg, setOverrideBg] = useState(false);
  const [overrideBorder, setOverrideBorder] = useState(false);
  const [overridePrefixColor, setOverridePrefixColor] = useState(false);

  return (
    <div>
      <div className={styles.settings}>
        <section>
          <span>Override background color</span>
          <Switch checked={overrideBg} onChange={setOverrideBg} />
        </section>

        <section>
          <span>Override border color</span>
          <Switch checked={overrideBorder} onChange={setOverrideBorder} />
        </section>

        <section>
          <span>Override icon color</span>
          <Switch
            checked={overridePrefixColor}
            onChange={setOverridePrefixColor}
          />
        </section>
      </div>

      <Groups
        className={clsx({
          [styles.overrideBackground]: overrideBg,
          [styles.overrideBorder]: overrideBorder,
        })}
        iconClassName={clsx({
          [styles.overrideIconColor]: overridePrefixColor,
        })}
      />
    </div>
  );
};

export const CustomSize = () => {
  const sizes = [
    [13, 2],
    [15, 2],
    [17, 2],
    [19, 2],
    [21, 3],
    [23, 3],
    [25, 3],
    [27, 3],
    [29, 4],
    [31, 4],
    [33, 4],
    [35, 4],
  ];
  return types.map(type => {
    return (
      <div key={type}>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          {sizes.map(size => (
            <div
              key={size[0]}
              style={{
                fontSize: 10,
                textAlign: 'center',
                color: 'rgba(100, 100, 100, 0.5)',
              }}
            >
              <IconButton
                size={size[0]}
                style={{ padding: size[1] }}
                variant={type}
              >
                <AfFiNeIcon />
              </IconButton>

              <div style={{ marginTop: 8 }}>Size: {size[0]}px</div>
              <div style={{ marginTop: 2 }}>Padding: {size[1]}px</div>
            </div>
          ))}
        </div>
      </div>
    );
  });
};

export const Disabled = () => <Groups disabled />;
