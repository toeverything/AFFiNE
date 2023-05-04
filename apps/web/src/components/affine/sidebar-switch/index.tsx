import { Tooltip } from '@affine/component';
import { appSidebarOpenAtom } from '@affine/component/app-sidebar';
import { getEnvironment } from '@affine/env';
import { useTranslation } from '@affine/i18n';
import { useAtom } from 'jotai';
import { useCallback, useEffect, useState } from 'react';

import { SidebarSwitchIcon } from './icons';
import { StyledSidebarSwitch } from './style';
type SidebarSwitchProps = {
  visible?: boolean;
  tooltipContent?: string;
};

// fixme: the following code is not correct, SSR will fail because hydrate will not match the client side render
//  in `StyledSidebarSwitch` a component
export const SidebarSwitch = ({
  visible = true,
  tooltipContent,
  ...props
}: SidebarSwitchProps) => {
  const [open, setOpen] = useAtom(appSidebarOpenAtom);
  const [tooltipVisible, setTooltipVisible] = useState(false);
  const { t } = useTranslation();
  const checkIsMac = () => {
    const env = getEnvironment();
    return env.isBrowser && env.isMacOs;
  };
  const [isMac, setIsMac] = useState(false);
  const collapseKeyboardShortcuts = isMac ? ' ⌘+/' : ' Ctrl+/';

  useEffect(() => {
    setIsMac(checkIsMac());
  }, []);

  tooltipContent =
    tooltipContent || (open ? t('Collapse sidebar') : t('Expand sidebar'));

  return (
    <Tooltip
      content={tooltipContent + ' ' + collapseKeyboardShortcuts}
      placement="right"
      zIndex={1000}
      visible={tooltipVisible}
    >
      <StyledSidebarSwitch
        {...props}
        visible={visible}
        disabled={!visible}
        onClick={useCallback(() => {
          setOpen(open => !open);
          setTooltipVisible(false);
        }, [setOpen])}
        onMouseEnter={useCallback(() => {
          setTooltipVisible(true);
        }, [])}
        onMouseLeave={useCallback(() => {
          setTooltipVisible(false);
        }, [])}
      >
        <SidebarSwitchIcon />
      </StyledSidebarSwitch>
    </Tooltip>
  );
};
