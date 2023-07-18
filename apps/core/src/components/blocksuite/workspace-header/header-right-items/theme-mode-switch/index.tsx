import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { DarkModeIcon, LightModeIcon } from '@blocksuite/icons';
import { useTheme } from 'next-themes';

import {
  StyledSwitchItem,
  StyledThemeButton,
  StyledThemeButtonContainer,
  StyledThemeModeContainer,
  StyledThemeModeSwitch,
  StyledVerticalDivider,
} from './style';

export const MenuThemeModeSwitch = () => {
  const { setTheme, resolvedTheme, theme } = useTheme();
  const t = useAFFiNEI18N();
  return (
    <StyledThemeModeContainer>
      <StyledThemeModeSwitch data-testid="change-theme-container" inMenu={true}>
        <StyledSwitchItem active={resolvedTheme === 'light'} inMenu={true}>
          <LightModeIcon />
        </StyledSwitchItem>
        <StyledSwitchItem active={resolvedTheme === 'dark'} inMenu={true}>
          <DarkModeIcon />
        </StyledSwitchItem>
      </StyledThemeModeSwitch>
      <StyledThemeButtonContainer>
        <StyledThemeButton
          data-testid="change-theme-light"
          active={theme === 'light'}
          onClick={() => {
            setTheme('light');
          }}
        >
          {t['light']()}
        </StyledThemeButton>
        <StyledVerticalDivider />
        <StyledThemeButton
          data-testid="change-theme-dark"
          active={theme === 'dark'}
          onClick={() => {
            setTheme('dark');
          }}
        >
          {t['dark']()}
        </StyledThemeButton>
        <StyledVerticalDivider />
        <StyledThemeButton
          active={theme === 'system'}
          onClick={() => {
            setTheme('system');
          }}
        >
          {t['system']()}
        </StyledThemeButton>
      </StyledThemeButtonContainer>
    </StyledThemeModeContainer>
  );
};

export default MenuThemeModeSwitch;
