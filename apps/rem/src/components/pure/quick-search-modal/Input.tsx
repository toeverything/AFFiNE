import { useTranslation } from '@affine/i18n';
import { SearchIcon } from '@blocksuite/icons';
import { Command } from 'cmdk';
import React, { useEffect, useRef, useState } from 'react';

import { StyledInputContent, StyledLabel } from './style';
export const Input = (props: {
  open: boolean;
  query: string;
  setQuery: (query: string) => void;
  isPublic: boolean;
  publishWorkspaceName: string | undefined;
}) => {
  const { open, query, setQuery, isPublic, publishWorkspaceName } = props;
  const [isComposition, setIsComposition] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const { t } = useTranslation();
  useEffect(() => {
    if (open) {
      const inputElement = inputRef.current;
      return inputElement?.focus();
    }
  }, [open]);
  useEffect(() => {
    const inputElement = inputRef.current;
    if (!open) {
      return;
    }
    const handleFocus = () => {
      inputElement?.focus();
    };
    inputElement?.addEventListener('blur', handleFocus, true);
    return () => inputElement?.removeEventListener('blur', handleFocus, true);
  }, [inputRef, open]);
  useEffect(() => {
    setInputValue(query);
  }, [query]);
  return (
    <StyledInputContent>
      <StyledLabel htmlFor=":r5:">
        <SearchIcon />
      </StyledLabel>
      <Command.Input
        ref={inputRef}
        value={inputValue}
        onCompositionStart={() => {
          setIsComposition(true);
        }}
        onCompositionEnd={e => {
          setQuery(e.data);
          setIsComposition(false);
        }}
        onValueChange={str => {
          setInputValue(str);
          if (!isComposition) {
            setQuery(str);
          }
        }}
        onKeyDown={(e: React.KeyboardEvent) => {
          if (e.key === 'a' && e.metaKey) {
            e.stopPropagation();
            inputRef.current?.select();
            return;
          }
          if (isComposition) {
            if (
              e.key === 'ArrowDown' ||
              e.key === 'ArrowUp' ||
              e.key === 'Enter'
            ) {
              e.stopPropagation();
            }
          }
        }}
        placeholder={
          isPublic
            ? t('Quick search placeholder2', {
                workspace: publishWorkspaceName,
              })
            : t('Quick search placeholder')
        }
      />
    </StyledInputContent>
  );
};
