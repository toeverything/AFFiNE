import React, { useEffect, useState } from 'react';
import { LogoIcon, MoreIcon, ExportIcon } from './icons';
import {
  StyledHeader,
  StyledTitle,
  StyledTitleWrapper,
  StyledLogo,
  StyledHeaderRightSide,
  StyledMoreMenuItem,
  IconButton,
  StyledHeaderContainer,
  StyledBrowserWarning,
  StyledCloseButton,
} from './styles';
import { Popover } from '@/ui/popover';
import { useEditor } from '@/components/editor-provider';
import EditorModeSwitch from '@/components/editor-mode-switch';
import { EdgelessIcon, PaperIcon } from '../editor-mode-switch/icons';
import ThemeModeSwitch from '@/components/theme-mode-switch';
import { useModal } from '@/components/global-modal-provider';
import CloseIcon from '@mui/icons-material/Close';
import { getWarningMessage, shouldShowWarning } from './utils';
const PopoverContent = () => {
  const { editor, mode, setMode } = useEditor();
  return (
    <>
      <StyledMoreMenuItem
        onClick={() => {
          setMode(mode === 'page' ? 'edgeless' : 'page');
        }}
      >
        {mode === 'page' ? <EdgelessIcon /> : <PaperIcon />}
        Convert to {mode === 'page' ? 'Edgeless' : 'Page'}
      </StyledMoreMenuItem>
      <StyledMoreMenuItem
        onClick={() => {
          editor && editor.contentParser.onExportHtml();
        }}
      >
        <ExportIcon />
        Export to HTML
      </StyledMoreMenuItem>
      <StyledMoreMenuItem
        onClick={() => {
          editor && editor.contentParser.onExportMarkdown();
        }}
      >
        <ExportIcon />
        Export to Markdown
      </StyledMoreMenuItem>
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
          <Popover
            popoverContent={<PopoverContent />}
            style={{ marginLeft: '20px' }}
          >
            <IconButton>
              <MoreIcon />
            </IconButton>
          </Popover>
        </StyledHeaderRightSide>
      </StyledHeader>
    </StyledHeaderContainer>
  );
};
