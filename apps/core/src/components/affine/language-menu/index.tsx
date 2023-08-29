import { LOCALES } from '@affine/i18n';
import { useI18N } from '@affine/i18n';
import { Menu, MenuItem, MenuTrigger } from '@toeverything/components/menu';
import type { ReactElement } from 'react';
import { useCallback, useRef } from 'react';

const LanguageMenuContent = ({
  currentLanguage,
  onSelect,
}: {
  currentLanguage?: string;
  onSelect: (value: string) => void;
}) => {
  return (
    <>
      {LOCALES.map(option => {
        return (
          <MenuItem
            key={option.name}
            selected={currentLanguage === option.originalName}
            title={option.name}
            onSelect={() => onSelect(option.tag)}
          >
            {option.originalName}
          </MenuItem>
        );
      })}
    </>
  );
};

export const LanguageMenu = () => {
  const i18n = useI18N();
  const ref = useRef(null);
  const currentLanguage = LOCALES.find(item => item.tag === i18n.language);
  const onSelect = useCallback(
    (event: string) => {
      return i18n.changeLanguage(event);
    },
    [i18n]
  );
  return (
    <Menu
      items={
        (
          <LanguageMenuContent
            currentLanguage={currentLanguage?.originalName}
            onSelect={onSelect}
          />
        ) as ReactElement
      }
      portalOptions={{
        container: ref.current,
      }}
    >
      <MenuTrigger
        ref={ref}
        data-testid="language-menu-button"
        style={{ textTransform: 'capitalize', fontWeight: 600 }}
        block={true}
      >
        {currentLanguage?.originalName}
      </MenuTrigger>
    </Menu>
  );
};
