import { MuiSlide } from '@affine/component';
import { Tooltip } from '@affine/component';
import { useTranslation } from '@affine/i18n';
import { useEffect, useState } from 'react';

import useCurrentPageMeta from '@/hooks/use-current-page-meta';
import useHistoryUpdated from '@/hooks/use-history-update';
import { useGlobalState } from '@/store/app';

import {
  ConnectorIcon,
  PenIcon,
  RedoIcon,
  SelectIcon,
  ShapeIcon,
  StickerIcon,
  TextIcon,
  UndoIcon,
} from './Icons';
import {
  StyledEdgelessToolbar,
  StyledToolbarItem,
  StyledToolbarWrapper,
} from './style';

const useToolbarList1 = () => {
  const { t } = useTranslation();
  return [
    {
      flavor: 'select',
      icon: <SelectIcon />,
      toolTip: t('Select'),
      disable: false,
      callback: () => {
        window.dispatchEvent(
          new CustomEvent('affine.switch-mouse-mode', {
            detail: {
              type: 'default',
            },
          })
        );
      },
    },
    {
      flavor: 'text',
      icon: <TextIcon />,
      toolTip: t('Text'),
      disable: true,
    },
    {
      flavor: 'shape',
      icon: <ShapeIcon />,
      toolTip: t('Shape'),
      disable: false,
      callback: () => {
        window.dispatchEvent(
          new CustomEvent('affine.switch-mouse-mode', {
            detail: {
              type: 'shape',
              color: 'black',
              shape: 'rectangle',
            },
          })
        );
      },
    },
    {
      flavor: 'sticky',
      icon: <StickerIcon />,
      toolTip: t('Sticky'),
      disable: true,
    },
    {
      flavor: 'pen',
      icon: <PenIcon />,
      toolTip: t('Pen'),
      disable: true,
    },

    {
      flavor: 'connector',
      icon: <ConnectorIcon />,
      toolTip: t('Connector'),
      disable: true,
    },
  ];
};

const UndoRedo = () => {
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const currentPage = useGlobalState(store => store.currentPage);
  const onHistoryUpdated = useHistoryUpdated();
  const { t } = useTranslation();
  useEffect(() => {
    onHistoryUpdated(page => {
      setCanUndo(page.canUndo);
      setCanRedo(page.canRedo);
    });
  }, [onHistoryUpdated]);

  return (
    <StyledToolbarWrapper>
      <Tooltip content={t('Undo')} placement="right-start">
        <StyledToolbarItem
          disable={!canUndo}
          onClick={() => {
            currentPage?.undo();
          }}
        >
          <UndoIcon />
        </StyledToolbarItem>
      </Tooltip>
      <Tooltip content={t('Redo')} placement="right-start">
        <StyledToolbarItem
          disable={!canRedo}
          onClick={() => {
            currentPage?.redo();
          }}
        >
          <RedoIcon />
        </StyledToolbarItem>
      </Tooltip>
    </StyledToolbarWrapper>
  );
};

export const EdgelessToolbar = () => {
  const { mode } = useCurrentPageMeta() || {};

  return (
    <MuiSlide
      direction="right"
      in={mode === 'edgeless'}
      mountOnEnter
      unmountOnExit
    >
      <StyledEdgelessToolbar aria-label="edgeless-toolbar">
        <StyledToolbarWrapper>
          {useToolbarList1().map(
            ({ icon, toolTip, flavor, disable, callback }, index) => {
              return (
                <Tooltip key={index} content={toolTip} placement="right-start">
                  <StyledToolbarItem
                    disable={disable}
                    onClick={() => {
                      console.log('click toolbar button:', flavor);
                      callback?.();
                    }}
                  >
                    {icon}
                  </StyledToolbarItem>
                </Tooltip>
              );
            }
          )}
        </StyledToolbarWrapper>
        <UndoRedo />
      </StyledEdgelessToolbar>
    </MuiSlide>
  );
};

export default EdgelessToolbar;
