import { Content } from '@affine/component';
import React, { useEffect, useState } from 'react';

import EditorModeSwitch from '@/components/editor-mode-switch';
import useCurrentPageMeta from '@/hooks/use-current-page-meta';
import usePropsUpdated from '@/hooks/use-props-updated';
import { useGlobalState } from '@/store/app';

import Header from './Header';
import QuickSearchButton from './QuickSearchButton';
import {
  StyledSearchArrowWrapper,
  StyledSwitchWrapper,
  StyledTitle,
  StyledTitleWrapper,
} from './styles';

export const EditorHeader = () => {
  const [title, setTitle] = useState('');
  const [isHover, setIsHover] = useState(false);
  const editor = useGlobalState(store => store.editor);
  const { trash: isTrash = false } = useCurrentPageMeta() || {};
  const onPropsUpdated = usePropsUpdated();

  useEffect(() => {
    onPropsUpdated(editor => {
      setTitle(editor.pageBlockModel?.title || 'Untitled');
    });
  }, [onPropsUpdated]);

  useEffect(() => {
    setTimeout(() => {
      // If first time in, need to wait for editor to be inserted into DOM
      setTitle(editor?.pageBlockModel?.title || 'Untitled');
    }, 300);
  }, [editor]);

  return (
    <Header
      rightItems={
        isTrash
          ? ['trashButtonGroup']
          : ['syncUser', 'themeModeSwitch', 'editorOptionMenu']
      }
    >
      {title && (
        <StyledTitle
          data-tauri-drag-region
          onMouseEnter={() => {
            if (isTrash) return;

            setIsHover(true);
          }}
          onMouseLeave={() => {
            if (isTrash) return;

            setIsHover(false);
          }}
        >
          <StyledTitleWrapper>
            <StyledSwitchWrapper>
              <EditorModeSwitch
                isHover={isHover}
                style={{
                  marginRight: '12px',
                }}
              />
            </StyledSwitchWrapper>
            <Content ellipsis={true}>{title}</Content>
            <StyledSearchArrowWrapper>
              <QuickSearchButton />
            </StyledSearchArrowWrapper>
          </StyledTitleWrapper>
        </StyledTitle>
      )}
    </Header>
  );
};

export default EditorHeader;
