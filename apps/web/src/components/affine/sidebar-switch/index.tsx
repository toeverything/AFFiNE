import { Tooltip } from '@affine/component';
import { useTranslation } from '@affine/i18n';
import React, { useCallback, useState } from 'react';

import { useSidebarStatus } from '../../../hooks/affine/use-sidebar-status';
import { SidebarSwitchIcon } from './icons';
import { StyledSidebarSwitch } from './style';
type SidebarSwitchProps = {
  visible?: boolean;
  tooltipContent?: string;
  testid?: string;
};
export const SidebarSwitch = ({
  visible = true,
  tooltipContent,
  testid = '',
}: SidebarSwitchProps) => {
  const [open, setOpen] = useSidebarStatus();
  const [tooltipVisible, setTooltipVisible] = useState(false);
  const { t } = useTranslation();
  tooltipContent =
    tooltipContent || (open ? t('Collapse sidebar') : t('Expand sidebar'));

  return (
    <Tooltip
      content={tooltipContent}
      placement="right"
      zIndex={1000}
      visible={tooltipVisible}
    >
      <StyledSidebarSwitch
        visible={visible}
        data-testid={testid}
        onClick={useCallback(() => {
          setOpen(!open);
          setTooltipVisible(false);
        }, [open, setOpen])}
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
