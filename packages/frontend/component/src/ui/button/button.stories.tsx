import {
  AfFiNeIcon,
  ArrowRightBigIcon,
  FolderIcon,
} from '@blocksuite/icons/rc';
import type { Meta } from '@storybook/react';
import clsx from 'clsx';
import { useCallback, useEffect, useState } from 'react';

import { Switch } from '../switch';
import type { ButtonProps } from './button';
import { Button } from './button';
import * as styles from './button.stories.css';
export default {
  title: 'UI/Button',
  component: Button,
} satisfies Meta<ButtonProps>;

// const Template: StoryFn<ButtonProps> = args => <Button {...args} />;

const types: ButtonProps['variant'][] = ['brand', 'default'];
const importances: ButtonProps['importance'][] = ['primary', 'default'];
const sizes: ButtonProps['size'][] = [300, 400, 500];

const Groups = ({
  children,
  ...props
}: Omit<ButtonProps, 'variant' | 'size'>) => {
  return (
    <table className={styles.table}>
      <thead>
        <tr>
          <td>Type & Importance/Size</td>
          {sizes.map(size => (
            <td key={size}>{size}</td>
          ))}
        </tr>
      </thead>
      <tbody>
        {types.map(type =>
          importances.map(importance => (
            <tr key={(type || '') + (importance || '')}>
              <td>
                {type} & {importance}
              </td>
              {sizes.map(size => (
                <td key={size}>
                  <Button
                    variant={type}
                    size={size}
                    importance={importance}
                    {...props}
                  >
                    {children ?? `${size} - ${type} & ${importance}`}
                  </Button>
                </td>
              ))}
            </tr>
          ))
        )}
      </tbody>
    </table>
  );
};

export const Default = () => <Groups />;

export const WithIcon = () => {
  return <Groups prefix={<FolderIcon />} suffix={<span>🚀</span>} />;
};

export const Loading = () => {
  const [loading, setLoading] = useState(false);

  const toggleLoading = useCallback(() => setLoading(v => !v), []);

  useEffect(() => {
    setInterval(toggleLoading, 1000);
  }, [toggleLoading]);

  return <Groups loading={loading} prefix={<FolderIcon />} />;
};

export const OverrideViaClassName = () => {
  const [overrideBg, setOverrideBg] = useState(false);
  const [overrideTextColor, setOverrideTextColor] = useState(false);
  const [overrideBorder, setOverrideBorder] = useState(false);
  const [overrideFontSize, setOverrideFontSize] = useState(false);
  const [overridePrefixSize, setOverridePrefixSize] = useState(false);
  const [overrideSuffixSize, setOverrideSuffixSize] = useState(false);
  const [overridePrefixColor, setOverridePrefixColor] = useState(false);
  const [overrideSuffixColor, setOverrideSuffixColor] = useState(false);

  return (
    <div>
      <div className={styles.settings}>
        <section>
          <span>Override background color</span>
          <Switch checked={overrideBg} onChange={setOverrideBg} />
        </section>

        <section>
          <span>Override text color</span>
          <Switch checked={overrideTextColor} onChange={setOverrideTextColor} />
        </section>

        <section>
          <span>Override border color</span>
          <Switch checked={overrideBorder} onChange={setOverrideBorder} />
        </section>

        <section>
          <span>Override font size</span>
          <Switch checked={overrideFontSize} onChange={setOverrideFontSize} />
        </section>

        <section>
          <span>Override prefix size</span>
          <Switch
            checked={overridePrefixSize}
            onChange={setOverridePrefixSize}
          />
        </section>

        <section>
          <span>Override suffix size</span>
          <Switch
            checked={overrideSuffixSize}
            onChange={setOverrideSuffixSize}
          />
        </section>

        <section>
          <span>Override prefix color</span>
          <Switch
            checked={overridePrefixColor}
            onChange={setOverridePrefixColor}
          />
        </section>

        <section>
          <span>Override suffix color</span>
          <Switch
            checked={overrideSuffixColor}
            onChange={setOverrideSuffixColor}
          />
        </section>
      </div>

      <Groups
        prefix={<FolderIcon />}
        suffix={<ArrowRightBigIcon />}
        className={clsx({
          [styles.overrideBackground]: overrideBg,
          [styles.overrideTextColor]: overrideTextColor,
          [styles.overrideBorder]: overrideBorder,
          [styles.overrideFontSize]: overrideFontSize,
        })}
        prefixClassName={clsx({
          [styles.overrideIconSize]: overridePrefixSize,
          [styles.overrideIconColor]: overridePrefixColor,
        })}
        suffixClassName={clsx({
          [styles.overrideIconSize]: overrideSuffixSize,
          [styles.overrideIconColor]: overrideSuffixColor,
        })}
      />
    </div>
  );
};

export const FixedWidth = () => {
  const widths = [60, 100, 120, 160, 180];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {widths.map(width => (
        <Button prefix={<AfFiNeIcon />} key={width} style={{ width }}>
          This is a width fixed button
        </Button>
      ))}
    </div>
  );
};

export const Disabled = () => {
  return <Groups disabled />;
};
