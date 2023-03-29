import { Tooltip } from '@affine/component';
import { useTranslation } from '@affine/i18n';
import { useCallback, useState } from 'react';

import {
  useGuideHidden,
  useGuideHiddenUntilNextUpdate,
  useUpdateTipsOnVersionChange,
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
  useUpdateTipsOnVersionChange();
  const [open, setOpen] = useSidebarStatus();
  const [tooltipVisible, setTooltipVisible] = useState(false);
  const [guideHidden, setGuideHidden] = useGuideHidden();
  const [guideHiddenUntilNextUpdate, setGuideHiddenUntilNextUpdate] =
    useGuideHiddenUntilNextUpdate();
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
          if (guideHiddenUntilNextUpdate['quickSearchTips'] === false) {
            setGuideHiddenUntilNextUpdate({
              ...guideHiddenUntilNextUpdate,
              quickSearchTips: true,
            });
            setTimeout(() => {
              setGuideHidden({ ...guideHidden, quickSearchTips: false });
            }, 200);
          }
        }, [
          guideHidden,
          guideHiddenUntilNextUpdate,
          open,
          setGuideHidden,
          setGuideHiddenUntilNextUpdate,
          setOpen,
        ])}
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
