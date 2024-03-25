import { Menu, MenuItem, MenuTrigger } from '@affine/component/ui/menu';
import type { ReactElement } from 'react';
import { memo } from 'react';

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
            lang={option.tag}
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
          width: '250px',
        },
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
