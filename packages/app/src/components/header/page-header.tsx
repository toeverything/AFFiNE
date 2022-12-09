import React, { useEffect, useState } from 'react';
import { StyledTitle, StyledTitleWrapper } from './styles';
import { useEditor } from '@/providers/editor-provider';
import EditorModeSwitch from '@/components/editor-mode-switch';

import Header from './header';

export const PageHeader = () => {
  const [title, setTitle] = useState('Untitled');
  const [isHover, setIsHover] = useState(false);

  const { editor } = useEditor();

  useEffect(() => {
    if (editor?.model) {
      setTitle(editor.model.title ?? '');
      editor.model.propsUpdated.on(() => {
        setTitle(editor.model.title);
      });
    }
  }, [editor]);

  return (
    <Header>
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
    </Header>
  );
};

export default PageHeader;
