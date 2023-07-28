import {
  type ButtonProps,
  Menu,
  MenuItem,
  MenuTrigger,
  styled,
} from '@affine/component';
import { LOCALES } from '@affine/i18n';
import { useI18N } from '@affine/i18n';
import type { FC, ReactElement } from 'react';
import { useCallback } from 'react';

export const StyledListItem = styled(MenuItem)(() => ({
  width: '132px',
  height: '38px',
  textTransform: 'capitalize',
}));

const LanguageMenuContent: FC<{
  currentLanguage?: string;
}> = ({ currentLanguage }) => {
  const i18n = useI18N();
  const changeLanguage = useCallback(
    (event: string) => {
      return i18n.changeLanguage(event);
    },
    [i18n]
  );
  return (
    <>
      {LOCALES.map(option => {
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
          >
            {option.originalName}
          </StyledListItem>
        );
      })}
    </>
  );
};
export const LanguageMenu: FC<{ triggerProps?: ButtonProps }> = ({
  triggerProps,
}) => {
  const i18n = useI18N();

  const currentLanguage = LOCALES.find(item => item.tag === i18n.language);

  return (
    <Menu
      content={
        (
          <LanguageMenuContent
            currentLanguage={currentLanguage?.originalName}
          />
        ) as ReactElement
      }
      placement="bottom-end"
      trigger="click"
      disablePortal={true}
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
