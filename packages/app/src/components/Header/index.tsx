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
import { AnimateRadio } from '@/components/animate-radio';

const PaperItem = ({ active }: { active?: boolean }) => {
  const {
    theme: {
      colors: { highlight, disabled },
    },
  } = useTheme();

  return <PaperIcon color={active ? highlight : disabled} />;
};

const EdgelessItem = ({ active }: { active?: boolean }) => {
  const {
    theme: {
      colors: { highlight, disabled },
    },
  } = useTheme();

  return <EdgelessIcon color={active ? highlight : disabled} />;
};
const EditorModeSwitch = ({ isHover }: { isHover: boolean }) => {
  const handleModeSwitch = (mode: 'page' | 'edgeless') => {
    const event = new CustomEvent('affine.switch-mode', { detail: mode });
    window.dispatchEvent(event);
  };
  return (
    <AnimateRadio
      isHover={isHover}
      labelLeft="Paper"
      iconLeft={<PaperItem />}
      labelRight="Edgeless"
      iconRight={<EdgelessItem />}
      style={{
        marginRight: '12px',
      }}
      initialValue="left"
      onChange={value => {
        handleModeSwitch(value === 'left' ? 'page' : 'edgeless');
      }}
    />
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
    <StyledHeader
      onMouseEnter={() => {
        setIsHover(true);
      }}
      onMouseLeave={() => {
        setIsHover(false);
      }}
    >
      <StyledLogo>
        <LogoIcon color={'#6880FF'} onClick={() => {}} />
      </StyledLogo>
      <StyledTitle>
        <EditorModeSwitch isHover={isHover} />
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
