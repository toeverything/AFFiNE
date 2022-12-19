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
export const Input = (props: {
  query: string;
  setQuery: Dispatch<SetStateAction<string>>;
  setLoading: Dispatch<SetStateAction<boolean>>;
}) => {
  const [isComposition, setIsComposition] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    inputRef.current?.addEventListener(
      'blur',
      () => {
        inputRef.current?.focus();
      },
      true
    );
    return inputRef.current?.focus();
  }, [inputRef]);
  useEffect(() => {
    return setInputValue(props.query);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <StyledInputContent>
      <StyledLabel htmlFor=":r5:">
        <SearchIcon />
      </StyledLabel>
      <Command.Input
        ref={inputRef}
        value={inputValue}
        onCompositionStart={e => {
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
        placeholder="Quick Search..."
      />
    </StyledInputContent>
  );
};
