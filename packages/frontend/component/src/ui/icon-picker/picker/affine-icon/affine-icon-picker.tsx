import keywords from '@blocksuite/icons/keywords/en.json';
import * as allIcons from '@blocksuite/icons/rc';
import { cssVarV2 } from '@toeverything/theme/v2';
import { startTransition, useCallback, useEffect, useState } from 'react';

import { IconButton } from '../../../button';
import Input from '../../../input';
import { Menu } from '../../../menu';
import { Scrollable } from '../../../scrollbar';
import { AffineIconRenderer } from '../../renderer/affine-icon';
import * as pickerStyles from '../picker.css';
import * as styles from './affine-icon-picker.css';

type Icon = {
  name: string;
  keywords: string[];
};

const icons = keywords['Emoji Panel'] as Icon[];

const colorList: string[] = [
  cssVarV2.block.callout.icon.red,
  cssVarV2.block.callout.icon.orange,
  cssVarV2.block.callout.icon.yellow,
  cssVarV2.block.callout.icon.green,
  cssVarV2.block.callout.icon.teal,
  cssVarV2.block.callout.icon.blue,
  cssVarV2.block.callout.icon.purple,
  cssVarV2.block.callout.icon.magenta,
  cssVarV2.block.callout.icon.grey,
];

const useRecentIcons = () => {
  const [recentIcons, setRecentIcons] = useState<Array<string>>([]);

  useEffect(() => {
    const recentIcons = localStorage.getItem('recentIcons');
    setRecentIcons(recentIcons ? recentIcons.split(',') : []);
  }, []);

  const add = useCallback((icon: string) => {
    setRecentIcons(prevRecentIcons => {
      const newRecentIcons = [
        icon,
        ...prevRecentIcons.filter(e => e !== icon),
      ].slice(0, 10);
      localStorage.setItem('recentIcons', newRecentIcons.join(','));
      return newRecentIcons;
    });
  }, []);

  return {
    recentIcons,
    add,
  };
};

export const AffineIconPicker = ({
  onSelect,
}: {
  onSelect?: (icon: string, color: string) => void;
}) => {
  const [filteredIcons, setFilteredIcons] = useState<Icon[]>([]);
  const [keyword, setKeyword] = useState('');
  const [color, setColor] = useState<string>(cssVarV2.block.callout.icon.blue);

  const { recentIcons, add: addRecentIcon } = useRecentIcons();

  useEffect(() => {
    startTransition(() => {
      if (!keyword) {
        setFilteredIcons(icons);
        return;
      }

      setFilteredIcons(
        icons.filter(icon =>
          icon.keywords.some(kw => kw.includes(keyword.toLowerCase()))
        )
      );
    });
  }, [keyword]);

  const handleIconSelect = useCallback(
    (icon: string) => {
      addRecentIcon(icon);
      onSelect?.(icon, color);
    },
    [addRecentIcon, onSelect, color]
  );

  return (
    <div className={pickerStyles.root}>
      {/* Search */}
      <header className={pickerStyles.searchContainer}>
        <Input
          value={keyword}
          onChange={setKeyword}
          className={pickerStyles.searchInput}
          preFix={
            <div style={{ marginLeft: 10, lineHeight: 0 }}>
              <allIcons.SearchIcon
                style={{ color: cssVarV2.icon.primary, fontSize: 16 }}
              />
            </div>
          }
          placeholder="Filter..."
        />

        {/* Color Picker */}
        <Menu
          contentOptions={{
            side: 'bottom',
            align: 'center',
            sideOffset: 4,
          }}
          items={
            <div className={styles.colorList}>
              {colorList.map(color => (
                <IconButton
                  key={color}
                  size={18}
                  style={{ padding: 2 }}
                  icon={
                    <div
                      className={styles.colorDot}
                      style={{ background: color }}
                    />
                  }
                  onClick={() => setColor(color)}
                />
              ))}
            </div>
          }
        >
          <IconButton
            size={18}
            style={{
              width: 32,
              height: 32,
              border: `1px solid ${cssVarV2.layer.insideBorder.border}`,
            }}
            icon={
              <div className={styles.colorDot} style={{ background: color }} />
            }
          />
        </Menu>
      </header>

      {/* Content */}
      <Scrollable.Root className={pickerStyles.iconScrollRoot}>
        <Scrollable.Viewport className={pickerStyles.scrollViewport}>
          {/* Recent */}
          {recentIcons.length ? (
            <div className={pickerStyles.group}>
              <div className={pickerStyles.groupName} data-group-name="Recent">
                Recent
              </div>
              <div className={pickerStyles.groupGrid}>
                {recentIcons.map(iconName => (
                  <IconButton
                    size={24}
                    style={{ padding: 4 }}
                    key={iconName}
                    icon={
                      <AffineIconRenderer style={{ color }} name={iconName} />
                    }
                    onClick={() => handleIconSelect(iconName)}
                  />
                ))}
              </div>
            </div>
          ) : null}

          {/* Groups */}
          <div className={pickerStyles.group}>
            <div className={pickerStyles.groupName} data-group-name="Recent">
              Icons
            </div>
            <div className={pickerStyles.groupGrid}>
              {filteredIcons.map(icon => {
                return (
                  <IconButton
                    size={24}
                    style={{ padding: 4 }}
                    key={icon.name}
                    icon={
                      <AffineIconRenderer style={{ color }} name={icon.name} />
                    }
                    onClick={() => handleIconSelect(icon.name)}
                  />
                );
              })}
            </div>
          </div>
        </Scrollable.Viewport>
        <Scrollable.Scrollbar />
      </Scrollable.Root>
    </div>
  );
};
