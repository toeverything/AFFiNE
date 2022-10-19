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
} from './styles';
import { Popover } from '@/components/popover';
import { useEditor } from '@/components/editor-provider';
import EditorModeSwitch from '@/components/editor-mode-switch';
import { EdgelessIcon, PaperIcon } from '../editor-mode-switch/icons';
import ThemeModeSwitch from '@/components/theme-mode-switch';
import ContactModal from '@/components/contact-modal';

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
        Convert to {mode === 'page' ? 'edgeless' : 'page'}
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
        Export to markdown
      </StyledMoreMenuItem>
    </>
  );
};

export const Header = () => {
  const [title, setTitle] = useState('');
  const [isHover, setIsHover] = useState(false);
  const [showContactModal, setShowContactModal] = useState(false);

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
    <>
      <ContactModal
        open={showContactModal}
        onClose={() => setShowContactModal(false)}
      />
      <StyledHeader>
        <StyledLogo>
          <LogoIcon
            onClick={() => {
              setShowContactModal(true);
            }}
          />
        </StyledLogo>
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
    </>
  );
};
