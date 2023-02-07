import React, {
  Dispatch,
  SetStateAction,
  useEffect,
  useRef,
  useState,
} from 'react';
import { SearchIcon } from '@blocksuite/icons';
import { StyledInputContent, StyledLabel } from './style';
import { Command } from 'cmdk';
import { useTranslation } from '@affine/i18n';
export const Input = (props: {
  query: string;
  setQuery: Dispatch<SetStateAction<string>>;
  setLoading: Dispatch<SetStateAction<boolean>>;
  isPublic: boolean;
  publishWorkspaceName: string | undefined;
}) => {
  const [isComposition, setIsComposition] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const { t } = useTranslation();
  useEffect(() => {
    inputRef.current?.addEventListener(
      'blur',
      () => {
        inputRef.current?.focus();
      },
      true
    );
    setInputValue(props.query);
    return inputRef.current?.focus();
  }, [inputRef, props.query]);
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
          props.setQuery(e.data);
          setIsComposition(false);
          if (!props.query) {
            props.setLoading(true);
          }
        }}
        onValueChange={str => {
          setInputValue(str);
          if (!isComposition) {
            props.setQuery(str);
            if (!props.query) {
              props.setLoading(true);
            }
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
          props.isPublic
            ? t('Quick search placeholder2', {
                workspace: props.publishWorkspaceName,
              })
            : t('Quick search placeholder')
        }
      />
    </StyledInputContent>
  );
};
