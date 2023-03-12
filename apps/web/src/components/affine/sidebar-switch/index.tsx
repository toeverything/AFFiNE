import { Tooltip } from '@affine/component';
import { useTranslation } from '@affine/i18n';
import { useCallback, useState } from 'react';

import {
  useIsFirstLoad,
  useOpenTips,
} from '../../../hooks/affine/use-is-first-load';
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
  const [isFirstLoad, setIsFirstLoad] = useIsFirstLoad();
  const [, setOpenTips] = useOpenTips();
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
        disabled={!visible}
        data-testid={testid}
        onClick={useCallback(() => {
          setOpen(!open);
          setTooltipVisible(false);
          if (isFirstLoad) {
            setIsFirstLoad(false);
            setTimeout(() => {
              setOpenTips(true);
            }, 200);
          }
        }, [isFirstLoad, open, setIsFirstLoad, setOpen, setOpenTips])}
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
