import React, { useEffect, useState } from 'react';
import { styled } from '@/styles';
import { LogoIcon, PaperIcon, EdgelessIcon, SunIcon, MoonIcon } from './icons';

const StyledHeader = styled('div')({
  height: '60px',
  width: '100vw',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  position: 'relative',
  padding: '0 22px',
});

const StyledTitle = styled('div')({
  width: '720px',
  height: '100%',
  position: 'absolute',
  left: 0,
  right: 0,
  top: 0,
  margin: 'auto',

  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  fontWeight: '600',
  fontSize: '20px',
});

const StyledTitleWrapper = styled('div')({
  maxWidth: '720px',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  position: 'relative',
});

const StyledLogo = styled('div')({});

const StyledModeSwitch = styled('div')({
  height: '100%',
  display: 'flex',
  alignItems: 'center',
  marginRight: '15px',
});

const ModeSwitch = () => {
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
  const [darkMode, setDarkMode] = useState(false);
  return (
    <div>
      <SunIcon></SunIcon>
      <MoonIcon></MoonIcon>
    </div>
  );
};

export const Header = () => {
  const [title, setTitle] = useState('');

  useEffect(() => {
    setTimeout(() => {
      const editor = window.editor;
      setTitle(editor.model.title);
      editor.model.propsUpdated.on(() => {
        setTitle(editor.model.title);
      });
    }, 1000);
  }, []);

  return (
    <StyledHeader>
      <StyledLogo>
        <LogoIcon color={'#6880FF'} onClick={() => {}} />
      </StyledLogo>
      <StyledTitle>
        <ModeSwitch />
        <StyledTitleWrapper>{title}</StyledTitleWrapper>
      </StyledTitle>
    </StyledHeader>
  );
};
