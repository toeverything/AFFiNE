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
    icon: <SelectIcon />,
    toolTip: 'Select',
    onClick: () => {},
    disable: false,
  },
  {
    icon: <TextIcon />,
    toolTip: 'Text(coming soon)',
    onClick: () => {},
    disable: true,
  },
  {
    icon: <ShapeIcon />,
    toolTip: 'Shape(coming soon)',
    onClick: () => {},
    disable: true,
  },
  {
    icon: <StickerIcon />,
    toolTip: 'Sticker(coming soon)',
    onClick: () => {},
    disable: true,
  },
  {
    icon: <PenIcon />,
    toolTip: 'Pen(coming soon)',
    onClick: () => {},
    disable: true,
  },

  {
    icon: <ConnectorIcon />,
    toolTip: 'Connector(coming soon)',
    onClick: () => {},
    disable: true,
  },
];
const toolbarList2 = [
  {
    icon: <UndoIcon />,
    toolTip: 'Undo(coming soon)',
    onClick: () => {},
    disable: true,
  },
  {
    icon: <RedoIcon />,
    toolTip: 'Redo(coming soon)',
    onClick: () => {},
    disable: true,
  },
];
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
          {toolbarList1.map(({ icon, toolTip, onClick, disable }, index) => {
            return (
              <Tooltip key={index} content={toolTip} placement="right-start">
                <StyledToolbarItem disable={disable} onClick={onClick}>
                  {icon}
                </StyledToolbarItem>
              </Tooltip>
            );
          })}
        </StyledToolbarWrapper>
        <StyledToolbarWrapper>
          {toolbarList2.map(({ icon, toolTip, onClick, disable }, index) => {
            return (
              <Tooltip key={index} content={toolTip} placement="right-start">
                <StyledToolbarItem disable={disable} onClick={onClick}>
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
