import { Menu, MenuItem, MenuTrigger } from '@toeverything/components/menu';
import { memo, type ReactElement } from 'react';

import { useLanguageHelper } from '../../../hooks/affine/use-language-helper';

// Fixme: keyboard focus should be supported by Menu component
const LanguageMenuContent = memo(function LanguageMenuContent() {
  const { currentLanguage, languagesList, onLanguageChange } =
    useLanguageHelper();
  return (
    <>
      {languagesList.map(option => {
        return (
          <MenuItem
            key={option.name}
            selected={currentLanguage?.originalName === option.originalName}
            title={option.name}
            onSelect={() => onLanguageChange(option.tag)}
          >
            {option.originalName}
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
        style: {
          background: 'var(--affine-white)',
        },
        align: 'end',
      }}
    >
      <MenuTrigger
        data-testid="language-menu-button"
        style={{ textTransform: 'capitalize', fontWeight: 600 }}
        block={true}
      >
        {currentLanguage?.originalName || ''}
      </MenuTrigger>
    </Menu>
  );
};
