import { DarkModeIcon, LightModeIcon } from '@blocksuite/icons';
import { useTheme } from 'next-themes';
import { useEffect } from 'react';

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
  useEffect(() => {
    if (environment.isDesktop) {
      window.apis?.onThemeChange(resolvedTheme === 'dark' ? 'dark' : 'light');
    }
  }, [resolvedTheme]);
  return (
    <StyledThemeModeContainer>
      <StyledThemeModeSwitch data-testid="change-theme-container" inMenu={true}>
        <StyledSwitchItem
          data-testid="change-theme-light"
          active={resolvedTheme === 'light'}
          inMenu={true}
        >
          <LightModeIcon />
        </StyledSwitchItem>
        <StyledSwitchItem
          data-testid="change-theme-dark"
          active={resolvedTheme === 'dark'}
          inMenu={true}
        >
          <DarkModeIcon />
        </StyledSwitchItem>
      </StyledThemeModeSwitch>
      <StyledThemeButtonContainer>
        <StyledThemeButton
          active={theme === 'light'}
          onClick={() => {
            setTheme('light');
          }}
        >
          light
        </StyledThemeButton>
        <StyledVerticalDivider />
        <StyledThemeButton
          active={theme === 'dark'}
          onClick={() => {
            setTheme('dark');
          }}
        >
          dark
        </StyledThemeButton>
        <StyledVerticalDivider />
        <StyledThemeButton
          active={theme === 'system'}
          onClick={() => {
            setTheme('system');
          }}
        >
          system
        </StyledThemeButton>
      </StyledThemeButtonContainer>
    </StyledThemeModeContainer>
  );
};

export default MenuThemeModeSwitch;
