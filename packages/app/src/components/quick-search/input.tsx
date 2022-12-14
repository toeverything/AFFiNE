import React, { Dispatch, SetStateAction, useEffect, useRef } from 'react';
import { SearchIcon } from '@blocksuite/icons';
import { StyledInputContent, StyledLabel } from './style';
import { Command } from 'cmdk';
export const Input = (props: {
  query: string;
  setQuery: Dispatch<SetStateAction<string>>;
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    return inputRef.current?.focus();
  }, [inputRef]);
  return (
    <StyledInputContent>
      <StyledLabel htmlFor=":r5:">
        <SearchIcon />
      </StyledLabel>
      <Command.Input
        ref={inputRef}
        value={props.query}
        onValueChange={props.setQuery}
        placeholder="Quick Search..."
      />
    </StyledInputContent>
  );
};
