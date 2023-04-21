import { DarkModeIcon, LightModeIcon } from '@blocksuite/icons';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';

import { StyledSwitchItem, StyledThemeModeSwitch } from './style';
export const ThemeModeSwitch = () => {
  const { setTheme, resolvedTheme } = useTheme();

  useEffect(() => {
    window.apis?.onThemeChange(resolvedTheme === 'dark' ? 'dark' : 'light');
  }, [resolvedTheme]);

  const [isHover, setIsHover] = useState(false);
  return (
    <StyledThemeModeSwitch
      data-testid="change-theme-container"
      onMouseEnter={() => {
        setIsHover(true);
      }}
      onMouseLeave={() => {
        setIsHover(false);
      }}
    >
      <StyledSwitchItem
        data-testid="change-theme-light"
        active={resolvedTheme === 'light'}
        isHover={isHover}
        onClick={() => {
          setTheme('light');
        }}
      >
        <LightModeIcon />
      </StyledSwitchItem>
      <StyledSwitchItem
        data-testid="change-theme-dark"
        active={resolvedTheme === 'dark'}
        isHover={isHover}
        onClick={() => {
          setTheme('dark');
        }}
      >
        <DarkModeIcon />
      </StyledSwitchItem>
    </StyledThemeModeSwitch>
  );
};

export default ThemeModeSwitch;
