import React, { useEffect, useState } from 'react';
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
import { useEditor } from '@/components/editor-provider';
import EditorModeSwitch from '@/components/editor-mode-switch';
import { EdgelessIcon, PaperIcon } from '../editor-mode-switch/icons';
import ThemeModeSwitch from '@/components/theme-mode-switch';
import { useModal } from '@/components/global-modal-provider';
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

const BrowserWarning = ({ onClose }: { onClose: () => void }) => {
  return (
    <StyledBrowserWarning>
      {getWarningMessage()}
      <StyledCloseButton onClick={onClose}>
        <CloseIcon />
      </StyledCloseButton>
    </StyledBrowserWarning>
  );
};

export const Header = () => {
  const [title, setTitle] = useState('');
  const [isHover, setIsHover] = useState(false);
  const [showWarning, setShowWarning] = useState(shouldShowWarning());

  const { contactModalHandler } = useModal();
  const { editor } = useEditor();

  useEffect(() => {
    if (editor) {
      setTitle(editor.model.title || '');
      editor.model.propsUpdated.on(() => {
        setTitle(editor.model.title);
      });
    }
  }, [editor]);
  return (
    <StyledHeaderContainer hasWarning={showWarning}>
      <BrowserWarning
        onClose={() => {
          setShowWarning(false);
        }}
      />
      <StyledHeader hasWarning={showWarning}>
        <StyledLogo
          data-testid="left-top-corner-logo"
          onClick={() => {
            contactModalHandler(true);
          }}
        >
          <LogoIcon />
        </StyledLogo>
        {title ? (
          <StyledTitle
            onMouseEnter={() => {
              setIsHover(true);
            }}
            onMouseLeave={() => {
              setIsHover(false);
            }}
          >
            <EditorModeSwitch
              isHover={isHover}
              style={{
                marginRight: '12px',
              }}
            />
            <StyledTitleWrapper>{title}</StyledTitleWrapper>
          </StyledTitle>
        ) : null}

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
