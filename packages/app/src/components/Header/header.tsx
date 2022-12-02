import React, { PropsWithChildren, useEffect, useState } from 'react';
import {
  LogoIcon,
  MoreIcon,
  ExportIcon,
  Export2Markdown,
  Export2HTML,
  RightArrow,
} from './icons';
import {
  StyledHeader,
  StyledTitle,
  StyledTitleWrapper,
  StyledLogo,
  StyledHeaderRightSide,
  IconButton,
  StyledHeaderContainer,
  StyledBrowserWarning,
  StyledCloseButton,
  StyledMenuItemWrapper,
} from './styles';
import { useEditor } from '@/providers/editor-provider';
import EditorModeSwitch from '@/components/editor-mode-switch';
import { EdgelessIcon, PaperIcon } from '../editor-mode-switch/icons';
import ThemeModeSwitch from '@/components/theme-mode-switch';
import { useModal } from '@/providers/global-modal-provider';
import CloseIcon from '@mui/icons-material/Close';
import { getWarningMessage, shouldShowWarning } from './utils';
import { Menu, MenuItem } from '@/ui/menu';

const PopoverContent = () => {
  const { editor, mode, setMode } = useEditor();
  return (
    <>
      <MenuItem
        onClick={() => {
          setMode(mode === 'page' ? 'edgeless' : 'page');
        }}
      >
        <StyledMenuItemWrapper>
          {mode === 'page' ? <EdgelessIcon /> : <PaperIcon />}
          Convert to {mode === 'page' ? 'Edgeless' : 'Page'}
        </StyledMenuItemWrapper>
      </MenuItem>
      <Menu
        placement="left-start"
        content={
          <>
            <MenuItem
              onClick={() => {
                editor && editor.contentParser.onExportHtml();
              }}
            >
              <StyledMenuItemWrapper>
                <Export2HTML />
                Export to HTML
              </StyledMenuItemWrapper>
            </MenuItem>
            <MenuItem
              onClick={() => {
                editor && editor.contentParser.onExportMarkdown();
              }}
            >
              <StyledMenuItemWrapper>
                <Export2Markdown />
                Export to Markdown
              </StyledMenuItemWrapper>
            </MenuItem>
          </>
        }
      >
        <MenuItem>
          <StyledMenuItemWrapper>
            <ExportIcon />
            Export
            <RightArrow />
          </StyledMenuItemWrapper>
        </MenuItem>
      </Menu>
    </>
  );
};

const BrowserWarning = ({
  show,
  onClose,
}: {
  show: boolean;
  onClose: () => void;
}) => {
  return (
    <StyledBrowserWarning show={show}>
      {getWarningMessage()}
      <StyledCloseButton onClick={onClose}>
        <CloseIcon />
      </StyledCloseButton>
    </StyledBrowserWarning>
  );
};

export const Header = ({ children }: PropsWithChildren<{}>) => {
  const [showWarning, setShowWarning] = useState(shouldShowWarning());

  return (
    <StyledHeaderContainer hasWarning={showWarning}>
      <BrowserWarning
        show={showWarning}
        onClose={() => {
          setShowWarning(false);
        }}
      />
      <StyledHeader hasWarning={showWarning}>
        {children}
        <StyledHeaderRightSide>
          <ThemeModeSwitch />
          <Menu content={<PopoverContent />} placement="bottom-end">
            <IconButton>
              <MoreIcon />
            </IconButton>
          </Menu>
        </StyledHeaderRightSide>
      </StyledHeader>
    </StyledHeaderContainer>
  );
};

export default Header;
