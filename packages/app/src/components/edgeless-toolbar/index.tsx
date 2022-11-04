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
import { useEditor } from '@/components/editor-provider';

const toolbarList1 = [
  {
    flavor: 'select',
    icon: <SelectIcon />,
    toolTip: 'Select',
    disable: false,
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
    toolTip: 'Shape (coming soon)',
    disable: true,
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
const toolbarList2 = [
  {
    flavor: 'undo',
    icon: <UndoIcon />,
    toolTip: 'Undo',
    disable: false,
  },
  {
    flavor: 'redo',
    icon: <RedoIcon />,
    toolTip: 'Redo',
    disable: false,
  },
];

const UndoRedo = () => {
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const { editor } = useEditor();
  useEffect(() => {
    if (!editor) return;
    const { space } = editor;

    space.signals.historyUpdated.on(() => {
      setCanUndo(space.canUndo);
      setCanRedo(space.canRedo);
    });
  }, [editor]);

  return (
    <StyledToolbarWrapper>
      <Tooltip content="Undo" placement="right-start">
        <StyledToolbarItem
          disable={!canUndo}
          onClick={() => {
            editor?.space?.undo();
          }}
        >
          <UndoIcon />
        </StyledToolbarItem>
      </Tooltip>
      <Tooltip content="Redo" placement="right-start">
        <StyledToolbarItem
          disable={!canRedo}
          onClick={() => {
            editor?.space?.redo();
          }}
        >
          <RedoIcon />
        </StyledToolbarItem>
      </Tooltip>
    </StyledToolbarWrapper>
  );
};

export const EdgelessToolbar = () => {
  const { mode } = useEditor();

  return (
    <Slide
      direction="right"
      in={mode === 'edgeless'}
      mountOnEnter
      unmountOnExit
    >
      <StyledEdgelessToolbar>
        <StyledToolbarWrapper>
          {toolbarList1.map(({ icon, toolTip, flavor, disable }, index) => {
            return (
              <Tooltip key={index} content={toolTip} placement="right-start">
                <StyledToolbarItem
                  disable={disable}
                  onClick={() => {
                    console.log('flavor', flavor);
                  }}
                >
                  {icon}
                </StyledToolbarItem>
              </Tooltip>
            );
          })}
        </StyledToolbarWrapper>
        <UndoRedo />
      </StyledEdgelessToolbar>
    </Slide>
  );
};

export default EdgelessToolbar;
