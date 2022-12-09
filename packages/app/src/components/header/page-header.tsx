import React, { useEffect, useState } from 'react';
import { StyledTitle, StyledTitleWrapper } from './styles';
import { useEditor } from '@/providers/editor-provider';
import EditorModeSwitch from '@/components/editor-mode-switch';
import { MiddleIconArrowDownSmallIcon } from '@blocksuite/icons';
import { useModal } from '@/providers/global-modal-provider';
import IconButton from '@/ui/button/icon-button';
import Header from './header';

export const PageHeader = () => {
  const [title, setTitle] = useState('');
  const [isHover, setIsHover] = useState(false);

  const { editor } = useEditor();
  const { triggerQuickSearchModal } = useModal();
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
          <IconButton
            style={{
              marginLeft: '6px',
            }}
          >
            <MiddleIconArrowDownSmallIcon
              onClick={() => {
                triggerQuickSearchModal(true);
              }}
            />
          </IconButton>
        </StyledTitle>
      ) : null}
    </Header>
  );
};

export default PageHeader;
