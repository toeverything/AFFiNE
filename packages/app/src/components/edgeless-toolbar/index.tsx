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
import { Tooltip } from '@/components/tooltip';
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
    toolTip: 'Text(coming soon)',
    disable: true,
  },
  {
    flavor: 'shape',
    icon: <ShapeIcon />,
    toolTip: 'Shape(coming soon)',
    disable: true,
  },
  {
    flavor: 'sticky',
    icon: <StickerIcon />,
    toolTip: 'Sticky(coming soon)',
    disable: true,
  },
  {
    flavor: 'pen',
    icon: <PenIcon />,
    toolTip: 'Pen(coming soon)',
    disable: true,
  },

  {
    flavor: 'connector',
    icon: <ConnectorIcon />,
    toolTip: 'Connector(coming soon)',
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
export const EdgelessToolbar = () => {
  const { mode, editor } = useEditor();
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
        <StyledToolbarWrapper>
          {toolbarList2.map(({ icon, toolTip, flavor, disable }, index) => {
            return (
              <Tooltip key={index} content={toolTip} placement="right-start">
                <StyledToolbarItem
                  disable={disable}
                  onClick={() => {
                    switch (flavor) {
                      case 'undo':
                        editor?.store?.undo();
                        break;
                      case 'redo':
                        editor?.store?.redo();
                        break;
                    }
                  }}
                >
                  {icon}
                </StyledToolbarItem>
              </Tooltip>
            );
          })}
        </StyledToolbarWrapper>
      </StyledEdgelessToolbar>
    </Slide>
  );
};

export default EdgelessToolbar;
