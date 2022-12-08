import React from 'react';
import { MiddleSearchIcon } from '@blocksuite/icons';
import { StyledInput, StyledInputContent, StyledLabel } from './style';

const Input = () => {
  return (
    <StyledInputContent>
      <StyledLabel htmlFor="quickSearchInput">
        <MiddleSearchIcon />
      </StyledLabel>
      <StyledInput
        id="quickSearchInput"
        type="text"
        placeholder="Quick search..."
      />
    </StyledInputContent>
  );
};

export default Input;
