import {
  Menu,
  MenuItem,
  type MenuProps,
  MenuTrigger,
  styled,
} from '@affine/component';
import { LOCALES, useI18N } from '@affine/i18n';
import { assertExists } from '@blocksuite/global/utils';
import type { ButtonProps } from '@toeverything/components/button';
import { useCallback, useEffect, useState } from 'react';

export const StyledListItem = styled(MenuItem)(() => ({
  height: '38px',
  textTransform: 'capitalize',
}));

interface LanguageMenuContentProps {
  currentLanguage: string;
  currentLanguageIndex: number;
}

const LanguageMenuContent = ({
  currentLanguage,
  currentLanguageIndex,
}: LanguageMenuContentProps) => {
  const i18n = useI18N();
  const changeLanguage = useCallback(
    (targetLanguage: string) => {
      console.assert(
        LOCALES.some(item => item.tag === targetLanguage),
        'targetLanguage should be one of the LOCALES'
      );
      i18n.changeLanguage(targetLanguage).catch(err => {
        console.error('Failed to change language', err);
      });
    },
    [i18n]
  );

  const [focusedOptionIndex, setFocusedOptionIndex] = useState(
    currentLanguageIndex ?? 0
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      switch (event.key) {
        case 'ArrowUp':
          event.preventDefault();
          setFocusedOptionIndex(prevIndex =>
            prevIndex > 0 ? prevIndex - 1 : 0
          );
          break;
        case 'ArrowDown':
          event.preventDefault();
          setFocusedOptionIndex(prevIndex =>
            prevIndex < LOCALES.length - 1 ? prevIndex + 1 : LOCALES.length
          );
          break;
        case 'Enter':
          if (focusedOptionIndex !== -1) {
            const selectedOption = LOCALES[focusedOptionIndex];
            changeLanguage(selectedOption.tag);
          }
          break;
        default:
          break;
      }
    },
    [changeLanguage, focusedOptionIndex]
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleKeyDown]);

  return (
    <>
      {LOCALES.map((option, optionIndex) => {
        return (
          <StyledListItem
            key={option.name}
            active={option.tag === currentLanguage}
            userFocused={optionIndex == focusedOptionIndex}
            title={option.name}
            onClick={() => {
              changeLanguage(option.tag);
            }}
          >
            {option.originalName}
          </StyledListItem>
        );
      })}
    </>
  );
};

interface LanguageMenuProps extends Omit<MenuProps, 'children'> {
  triggerProps?: ButtonProps;
}

export const LanguageMenu = ({
  triggerProps,
  ...menuProps
}: LanguageMenuProps) => {
  const i18n = useI18N();

  const currentLanguageIndex = LOCALES.findIndex(
    item => item.tag === i18n.language
  );
  const currentLanguage = LOCALES[currentLanguageIndex];
  assertExists(currentLanguage, 'currentLanguage should exist');

  return (
    <Menu
      content={
        <LanguageMenuContent
          currentLanguage={currentLanguage.tag}
          currentLanguageIndex={currentLanguageIndex}
        />
      }
      placement="bottom-end"
      trigger="click"
      disablePortal={true}
      {...menuProps}
    >
      <MenuTrigger
        data-testid="language-menu-button"
        style={{ textTransform: 'capitalize' }}
        {...triggerProps}
      >
        {currentLanguage.originalName}
      </MenuTrigger>
    </Menu>
  );
};
