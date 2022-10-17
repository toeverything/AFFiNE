import React, { useEffect, useState } from 'react';
import { LogoIcon, SunIcon, MoonIcon, MoreIcon, ExportIcon } from './icons';
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
import { useTheme } from '@/styles';
import { useEditor } from '@/components/editor-provider';
import EditorModeSwitch from '@/components/editor-mode-switch';

const DarkModeSwitch = () => {
  const { changeMode, mode } = useTheme();

  return (
    <>
      {mode === 'dark' ? (
        <SunIcon
          style={{ cursor: 'pointer', color: '#9096A5' }}
          onClick={() => {
            changeMode('light');
          }}
        ></SunIcon>
      ) : (
        <MoonIcon
          style={{ cursor: 'pointer', color: '#9096A5' }}
          onClick={() => {
            changeMode('dark');
          }}
        ></MoonIcon>
      )}
    </>
  );
};

const PopoverContent = () => {
  const { editor } = useEditor();
  return (
    <div>
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
    </div>
  );
};

export const Header = () => {
  const [title, setTitle] = useState('');
  const [isHover, setIsHover] = useState(false);

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
    <StyledHeader>
      <StyledLogo>
        <LogoIcon style={{ color: '#6880FF' }} onClick={() => {}} />
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
        <DarkModeSwitch />
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
  );
};
