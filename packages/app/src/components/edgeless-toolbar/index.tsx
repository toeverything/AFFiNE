import { useState, useEffect } from 'react';
import {
  StyledEdgelessToolbar,
  StyledToolbarWrapper,
  StyledToolbarItem,
} from './style';
import {
  SelectIcon,
  TextIcon,
  ShapeIcon,
  PenIcon,
  StickerIcon,
  ConnectorIcon,
  UndoIcon,
  RedoIcon,
} from './icons';
import { Tooltip } from '@/ui/tooltip';
import Slide from '@mui/material/Slide';
import useCurrentPageMeta from '@/hooks/use-current-page-meta';
import { useAppState } from '@/providers/app-state-provider';
import useHistoryUpdated from '@/hooks/use-history-update';

const toolbarList1 = [
  {
    flavor: 'select',
    icon: <SelectIcon />,
    toolTip: 'Select',
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
    toolTip: 'Text (coming soon)',
    disable: true,
  },
  {
    flavor: 'shape',
    icon: <ShapeIcon />,
    toolTip: 'Shape',
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
    toolTip: 'Sticky (coming soon)',
    disable: true,
  },
  {
    flavor: 'pen',
    icon: <PenIcon />,
    toolTip: 'Pen (coming soon)',
    disable: true,
  },

  {
    flavor: 'connector',
    icon: <ConnectorIcon />,
    toolTip: 'Connector (coming soon)',
    disable: true,
  },
];

const UndoRedo = () => {
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const { currentPage } = useAppState();
  const onHistoryUpdated = useHistoryUpdated();

  useEffect(() => {
    onHistoryUpdated(page => {
      setCanUndo(page.canUndo);
      setCanRedo(page.canRedo);
    });
  }, [onHistoryUpdated]);

  return (
    <StyledToolbarWrapper>
      <Tooltip content="Undo" placement="right-start">
        <StyledToolbarItem
          disable={!canUndo}
          onClick={() => {
            currentPage?.undo();
          }}
        >
          <UndoIcon />
        </StyledToolbarItem>
      </Tooltip>
      <Tooltip content="Redo" placement="right-start">
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
    <Slide
      direction="right"
      in={mode === 'edgeless'}
      mountOnEnter
      unmountOnExit
    >
      <StyledEdgelessToolbar aria-label="edgeless-toolbar">
        <StyledToolbarWrapper>
          {toolbarList1.map(
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
    </Slide>
  );
};

export default EdgelessToolbar;
