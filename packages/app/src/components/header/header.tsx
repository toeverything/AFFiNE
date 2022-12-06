import React, { PropsWithChildren, useState } from 'react';
import {
  StyledHeader,
  StyledHeaderRightSide,
  StyledHeaderContainer,
  StyledBrowserWarning,
  StyledCloseButton,
} from './styles';
import {
  MiddleExportIcon,
  EdgelessIcon,
  PaperIcon,
  MiddleExportToHtmlIcon,
  MiddleExportToMarkdownIcon,
  MoreVertical_24pxIcon,
} from '@blocksuite/icons';
import { useEditor } from '@/providers/editor-provider';
import ThemeModeSwitch from '@/components/theme-mode-switch';
import { IconButton } from '@/ui/button';
import CloseIcon from '@mui/icons-material/Close';
import { getWarningMessage, shouldShowWarning } from './utils';
import { Menu, MenuItem } from '@/ui/menu';

const PopoverContent = () => {
  const { editor, mode, setMode } = useEditor();
  return (
    <>
      <MenuItem
        icon={mode === 'page' ? <EdgelessIcon /> : <PaperIcon />}
        onClick={() => {
          setMode(mode === 'page' ? 'edgeless' : 'page');
        }}
      >
        Convert to {mode === 'page' ? 'Edgeless' : 'Page'}
      </MenuItem>
      <Menu
        placement="left-start"
        content={
          <>
            <MenuItem
              onClick={() => {
                editor && editor.contentParser.onExportHtml();
              }}
              icon={<MiddleExportToHtmlIcon />}
            >
              Export to HTML
            </MenuItem>
            <MenuItem
              onClick={() => {
                editor && editor.contentParser.onExportMarkdown();
              }}
              icon={<MiddleExportToMarkdownIcon />}
            >
              Export to Markdown
            </MenuItem>
          </>
        }
      >
        <MenuItem icon={<MiddleExportIcon />} isDir={true}>
          Export
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
              <MoreVertical_24pxIcon />
            </IconButton>
          </Menu>
        </StyledHeaderRightSide>
      </StyledHeader>
    </StyledHeaderContainer>
  );
};

export default Header;
