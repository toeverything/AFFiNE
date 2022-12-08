import React from 'react';
import { StyledInput, StyledInputContent, StyledLabel } from './style';

const searchIcon = (
  <svg
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      fill-rule="evenodd"
      clip-rule="evenodd"
      d="M14.4 9.5C14.4 12.2062 12.2062 14.4 9.5 14.4C6.7938 14.4 4.6 12.2062 4.6 9.5C4.6 6.7938 6.7938 4.6 9.5 4.6C12.2062 4.6 14.4 6.7938 14.4 9.5ZM13.4215 14.6842C12.3315 15.5101 10.973 16 9.5 16C5.91015 16 3 13.0899 3 9.5C3 5.91015 5.91015 3 9.5 3C13.0899 3 16 5.91015 16 9.5C16 11.0402 15.4643 12.4553 14.5691 13.5691L21 20L19.8687 21.1313L13.4215 14.6842Z"
      fill="#9096A5"
    />
  </svg>
);

const Input = () => {
  return (
    <StyledInputContent>
      <StyledLabel htmlFor="quickSearchInput">{searchIcon}</StyledLabel>
      <StyledInput
        id="quickSearchInput"
        type="text"
        placeholder="Quick search..."
      />
    </StyledInputContent>
  );
};

export default Input;
