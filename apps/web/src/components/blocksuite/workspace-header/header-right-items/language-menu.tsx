import { Button, displayFlex, Menu, MenuItem, styled } from '@affine/component';
import { LOCALES } from '@affine/i18n';
import { useI18N } from '@affine/i18n';
import { ArrowDownSmallIcon, LanguageIcon } from '@blocksuite/icons';
import type { FC, ReactElement } from 'react';
import { useCallback } from 'react';

const LanguageMenuContent: FC = () => {
  const i18n = useI18N();
  const changeLanguage = useCallback(
    (event: string) => {
      void i18n.changeLanguage(event);
    },
    [i18n]
  );
  return (
    <>
      {LOCALES.map(option => {
        return (
          <StyledListItem
            key={option.name}
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
export const LanguageMenu: React.FC = () => {
  const i18n = useI18N();

  const currentLanguage = LOCALES.find(item => item.tag === i18n.language);

  return (
    <StyledContainer>
      <StyledIconContainer>
        <LanguageIcon />
      </StyledIconContainer>
      <StyledButtonContainer>
        <Menu
          content={(<LanguageMenuContent />) as ReactElement}
          placement="bottom"
          trigger="click"
          disablePortal={true}
        >
          <StyledButton
            icon={
              <StyledArrowDownContainer>
                <ArrowDownSmallIcon />
              </StyledArrowDownContainer>
            }
            iconPosition="end"
            noBorder={true}
            data-testid="language-menu-button"
          >
            <StyledCurrentLanguage>
              {currentLanguage?.originalName}
            </StyledCurrentLanguage>
          </StyledButton>
        </Menu>
      </StyledButtonContainer>
    </StyledContainer>
  );
};

const StyledListItem = styled(MenuItem)(() => ({
  width: '132px',
  height: '38px',
  fontSize: 'var(--affine-font-base)',
  textTransform: 'capitalize',
}));

const StyledContainer = styled('div')(() => {
  return {
    width: '100%',
    height: '48px',
    backgroundColor: 'transparent',
    ...displayFlex('flex-start', 'center'),
    padding: '0 14px',
  };
});
const StyledIconContainer = styled('div')(() => {
  return {
    width: '20px',
    height: '20px',
    color: 'var(--affine-icon-color)',
    fontSize: '20px',
    ...displayFlex('flex-start', 'center'),
  };
});
const StyledButtonContainer = styled('div')(() => {
  return {
    width: '100%',
    height: '32px',
    borderRadius: '4px',
    border: `1px solid var(--affine-border-color)`,
    backgroundColor: 'transparent',
    ...displayFlex('flex-start', 'center'),
    marginLeft: '12px',
  };
});
const StyledButton = styled(Button)(() => {
  return {
    width: '100%',
    height: '32px',
    borderRadius: '4px',
    backgroundColor: 'transparent',
    ...displayFlex('space-between', 'center'),
    textTransform: 'capitalize',
    padding: '0',
  };
});
const StyledArrowDownContainer = styled('div')(() => {
  return {
    height: '32px',
    borderLeft: `1px solid var(--affine-border-color)`,
    backgroundColor: 'transparent',
    ...displayFlex('flex-start', 'center'),
    padding: '4px 6px',
    fontSize: '24px',
  };
});
const StyledCurrentLanguage = styled('div')(() => {
  return {
    marginLeft: '12px',
    color: 'var(--affine-text-color)',
  };
});
