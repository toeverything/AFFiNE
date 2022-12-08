import React from 'react';
import { MiddleAddIcon } from '@blocksuite/icons';
import { StyledModalFooterContent } from './style';

const QuickSearchFooter = () => {
  return (
    <StyledModalFooterContent>
      <MiddleAddIcon />
      <span>New page</span>
    </StyledModalFooterContent>
  );
};

export default QuickSearchFooter;
