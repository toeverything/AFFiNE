import { Menu, MenuItem, MenuTrigger } from '@affine/component/ui/menu';
import { DoneIcon } from '@blocksuite/icons/rc';
import type { ReactElement } from 'react';
import { memo } from 'react';

import { useLanguageHelper } from '../../../components/hooks/affine/use-language-helper';
import * as styles from './style.css';

// Fixme: keyboard focus should be supported by Menu component
const LanguageMenuContent = memo(function LanguageMenuContent() {
  const { currentLanguage, languagesList, onLanguageChange } =
    useLanguageHelper();
  return (
    <>
      {languagesList.map(option => {
        const selected = currentLanguage?.originalName === option.originalName;
        return (
          <MenuItem
            key={option.name}
            title={option.name}
            lang={option.tag}
            onSelect={() => onLanguageChange(option.tag)}
            suffix={(option.Completeness * 100).toFixed(0) + '%'}
            data-selected={selected}
            className={styles.menuItem}
          >
            <div className={styles.languageLabelWrapper}>
              <div>{option.originalName}</div>
              {selected && <DoneIcon fontSize={'16px'} />}
            </div>
          </MenuItem>
        );
      })}
    </>
  );
});

export const LanguageMenu = () => {
  const { currentLanguage } = useLanguageHelper();
  return (
    <Menu
      items={(<LanguageMenuContent />) as ReactElement}
      contentOptions={{
        className: styles.menu,
        align: 'end',
      }}
    >
      <MenuTrigger
        data-testid="language-menu-button"
        style={{ textTransform: 'capitalize', fontWeight: 600, width: '250px' }}
        block={true}
      >
        {currentLanguage?.originalName || ''}
      </MenuTrigger>
    </Menu>
  );
};
