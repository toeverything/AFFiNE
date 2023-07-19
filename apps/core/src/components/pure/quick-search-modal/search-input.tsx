import { SearchIcon } from '@blocksuite/icons';
import { Command } from 'cmdk';
import { forwardRef } from 'react';

import { StyledInputContent, StyledLabel } from './style';

export const SearchInput = forwardRef<
  HTMLInputElement,
  Omit<
    React.InputHTMLAttributes<HTMLInputElement>,
    'value' | 'onChange' | 'type'
  > & {
    /**
     * Optional controlled state for the value of the search input.
     */
    value?: string;
    /**
     * Event handler called when the search value changes.
     */
    onValueChange?: (search: string) => void;
  } & React.RefAttributes<HTMLInputElement>
>((props, ref) => {
  return (
    <StyledInputContent>
      <StyledLabel htmlFor=":r5:">
        <SearchIcon />
      </StyledLabel>
      <Command.Input ref={ref} {...props} />
    </StyledInputContent>
  );
});

SearchInput.displayName = 'SearchInput';
