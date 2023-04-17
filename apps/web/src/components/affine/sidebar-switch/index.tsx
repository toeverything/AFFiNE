import { Tooltip } from '@affine/component';
import { useTranslation } from '@affine/i18n';
import { useCallback, useState } from 'react';

import {
  useGuideHidden,
  useGuideHiddenUntilNextUpdate,
  useUpdateTipsOnVersionChange,
} from '../../../hooks/use-is-first-load';
import { useSidebarStatus } from '../../../hooks/use-sidebar-status';
import { SidebarSwitchIcon } from './icons';
import { StyledSidebarSwitch } from './style';
type SidebarSwitchProps = {
  visible?: boolean;
  tooltipContent?: string;
};

// fixme: the following code is not correct, SSR will fail because hydrate will not match the client side render
//  in `StyledSidebarSwitch` component
export const SidebarSwitch = ({
  visible = true,
  tooltipContent,
  ...props
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
        {...props}
        visible={visible}
        disabled={!visible}
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
