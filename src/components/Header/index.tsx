import React, { useEffect, useState } from 'react';
import {
  LogoIcon,
  PaperIcon,
  EdgelessIcon,
  SunIcon,
  MoonIcon,
  MoreIcon,
  ExportIcon,
} from './icons';
import {
  StyledHeader,
  StyledTitle,
  StyledTitleWrapper,
  StyledLogo,
  StyledModeSwitch,
  StyledHeaderRightSide,
  StyledMoreMenuItem,
} from './styles';
import { Popover } from '@/components/popover';
import { useTheme } from '@/styles';
import { useEditor } from '@/components/editor-provider';

const EditorModeSwitch = () => {
  const [mode, setMode] = useState<'page' | 'edgeless'>('page');

  const handleModeSwitch = (mode: 'page' | 'edgeless') => {
    const event = new CustomEvent('affine.switch-mode', { detail: mode });
    window.dispatchEvent(event);

    setMode(mode);
  };
  return (
    <StyledModeSwitch>
      <PaperIcon
        color={mode === 'page' ? '#6880FF' : '#a6abb7'}
        onClick={() => {
          handleModeSwitch('page');
        }}
        style={{ cursor: 'pointer' }}
      ></PaperIcon>
      <EdgelessIcon
        color={mode === 'edgeless' ? '#6880FF' : '#a6abb7'}
        onClick={() => {
          handleModeSwitch('edgeless');
        }}
        style={{ cursor: 'pointer' }}
      ></EdgelessIcon>
    </StyledModeSwitch>
  );
};

const DarkModeSwitch = () => {
  const { changeMode, mode } = useTheme();

  return (
    <>
      {mode === 'dark' ? (
        <SunIcon
          color="#9096A5"
          style={{ cursor: 'pointer' }}
          onClick={() => {
            changeMode('light');
          }}
        ></SunIcon>
      ) : (
        <MoonIcon
          color="#9096A5"
          style={{ cursor: 'pointer' }}
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
        <LogoIcon color={'#6880FF'} onClick={() => {}} />
      </StyledLogo>
      <StyledTitle>
        <EditorModeSwitch />
        <StyledTitleWrapper>{title}</StyledTitleWrapper>
      </StyledTitle>

      <StyledHeaderRightSide>
        <DarkModeSwitch />
        <Popover popoverContent={<PopoverContent />}>
          <MoreIcon color="#9096A5" style={{ marginLeft: '20px' }} />
        </Popover>
      </StyledHeaderRightSide>
    </StyledHeader>
  );
};
