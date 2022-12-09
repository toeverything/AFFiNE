import React, { Dispatch, SetStateAction } from 'react';
import { MiddleSearchIcon } from '@blocksuite/icons';
import { StyledInputContent, StyledLabel } from './style';
import { Command } from 'cmdk';
const Input = (props: {
  search: string;
  setSearch: Dispatch<SetStateAction<string>>;
}) => {
  return (
    <StyledInputContent>
      <StyledLabel htmlFor=":r5:">
        <MiddleSearchIcon />
      </StyledLabel>
      <Command.Input
        value={props.search}
        onValueChange={props.setSearch}
        placeholder="Quick Search..."
      />
    </StyledInputContent>
  );
};

export default Input;
