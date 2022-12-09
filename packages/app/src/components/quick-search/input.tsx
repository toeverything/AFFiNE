import React, { Dispatch, SetStateAction } from 'react';
import { MiddleSearchIcon } from '@blocksuite/icons';
import { StyledInputContent, StyledLabel } from './style';
import { Command } from 'cmdk';
const Input = (props: {
  query: string;
  setQuery: Dispatch<SetStateAction<string>>;
}) => {
  return (
    <StyledInputContent>
      <StyledLabel htmlFor=":r5:">
        <MiddleSearchIcon />
      </StyledLabel>
      <Command.Input
        value={props.query}
        onValueChange={props.setQuery}
        placeholder="Quick Search..."
      />
    </StyledInputContent>
  );
};

export default Input;
