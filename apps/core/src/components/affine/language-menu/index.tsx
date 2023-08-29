import {
  Menu,
  MenuItem,
  type MenuProps,
  MenuTrigger,
  styled,
} from '@affine/component';
import { LOCALES } from '@affine/i18n';
import { useI18N } from '@affine/i18n';
import type { ButtonProps } from '@toeverything/components/button';
import type { ReactElement } from 'react';
import { useCallback, useState , useEffect } from 'react';
export const StyledListItem = styled(MenuItem)(() => ({
  height: '38px',
  textTransform: 'capitalize',
}));

interface LanguageMenuContentProps {
  currentLanguage?: string;
  currentLanguageIndex?: number;
}

const LanguageMenuContent = ({ currentLanguage , currentLanguageIndex }: LanguageMenuContentProps) => {
  const i18n = useI18N();
  const changeLanguage = useCallback(
    (event: string) => {
      return i18n.changeLanguage(event);
    },
    [i18n]
  );

  const [focusedOptionIndex, setFocusedOptionIndex] = useState(currentLanguageIndex ?? 0);

  const handleKeyDown = useCallback((event : KeyboardEvent) => {
    switch (event.key) {
      case 'ArrowUp':
        event.preventDefault();
        setFocusedOptionIndex((prevIndex) =>
          prevIndex > 0 ? prevIndex - 1 : 0
        );
        break;
      case 'ArrowDown':
        event.preventDefault();
        setFocusedOptionIndex((prevIndex) =>
          prevIndex < LOCALES.length - 1 ? prevIndex + 1 : LOCALES.length
        );
        break;
      case 'Enter':
        if (focusedOptionIndex !== -1) {
          const selectedOption = LOCALES[focusedOptionIndex];
          changeLanguage(selectedOption.tag).catch((err) => {
            throw new Error('Failed to change language', err);
          });
        }
        break;
      default:
        break;
    }},
    [focusedOptionIndex]
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleKeyDown]);

  return (
    <>
      {LOCALES.map((option,optionIndex) => {
        return (
          <StyledListItem
            key={option.name}
            active={currentLanguage === option.originalName}
            title={option.name}
            onClick={() => {
              changeLanguage(option.tag).catch(err => {
                throw new Error('Failed to change language', err);
              });
            }}
            userFocused={optionIndex==focusedOptionIndex}
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
  
  const currentLanguageIndex = LOCALES.findIndex(item => item.tag === i18n.language);
  const currentLanguage = LOCALES[currentLanguageIndex];

  return (
    <Menu
      content={
        (
          <LanguageMenuContent
            currentLanguage={currentLanguage?.originalName}
            currentLanguageIndex={currentLanguageIndex}
          />
        ) as ReactElement
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
        {currentLanguage?.originalName}
      </MenuTrigger>
    </Menu>
  );
};
