import { Menu, MenuItem, MenuTrigger } from '@affine/component/ui/menu';
import { type I18n, I18nService } from '@affine/core/modules/i18n';
import { DoneIcon } from '@blocksuite/icons/rc';
import { useLiveData, useService } from '@toeverything/infra';
import type { ReactElement } from 'react';
import { memo } from 'react';

import * as styles from './style.css';

// Fixme: keyboard focus should be supported by Menu component
const LanguageMenuContent = memo(function LanguageMenuContent({
  current,
  onChange,
  i18n,
}: {
  i18n: I18n;
  current: string;
  onChange: (value: string) => void;
}) {
  return (
    <>
      {i18n.languageList.map(lang => {
        const selected = current === lang.key;
        return (
          <MenuItem
            key={lang.name}
            title={lang.name}
            lang={lang.key}
            onSelect={() => onChange(lang.key)}
            suffix={lang.completeness + '%'}
            data-selected={selected}
            className={styles.menuItem}
          >
            <div className={styles.languageLabelWrapper}>
              <div>{lang.originalName}</div>
              {selected && <DoneIcon fontSize={'16px'} />}
            </div>
          </MenuItem>
        );
      })}
    </>
  );
});

export const LanguageMenu = () => {
  const i18n = useService(I18nService).i18n;
  const currentLanguage = useLiveData(i18n.currentLanguage$);

  return (
    <Menu
      items={
        (
          <LanguageMenuContent
            current={currentLanguage.key}
            onChange={i18n.changeLanguage}
            i18n={i18n}
          />
        ) as ReactElement
      }
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
        {currentLanguage.originalName}
      </MenuTrigger>
    </Menu>
  );
};
