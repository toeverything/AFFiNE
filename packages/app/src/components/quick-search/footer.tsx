import React from 'react';
import { StyledModalFooterContent } from './style';

const addIcon = (
  <svg
    width="20"
    height="20"
    viewBox="0 0 20 20"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <mask
      id="mask0_4831_8057"
      maskUnits="userSpaceOnUse"
      x="0"
      y="0"
      width="20"
      height="20"
    >
      <rect width="20" height="20" fill="#D9D9D9" />
    </mask>
    <g mask="url(#mask0_4831_8057)">
      <path
        d="M10 15.625C9.81933 15.625 9.663 15.559 9.531 15.427C9.399 15.295 9.333 15.1387 9.333 14.958V10.667H5.042C4.86133 10.667 4.705 10.601 4.573 10.469C4.441 10.337 4.375 10.1807 4.375 10C4.375 9.81933 4.441 9.663 4.573 9.531C4.705 9.399 4.86133 9.333 5.042 9.333H9.333V5.042C9.333 4.86133 9.399 4.705 9.531 4.573C9.663 4.441 9.81933 4.375 10 4.375C10.1807 4.375 10.337 4.441 10.469 4.573C10.601 4.705 10.667 4.86133 10.667 5.042V9.333H14.958C15.1387 9.333 15.295 9.399 15.427 9.531C15.559 9.663 15.625 9.81933 15.625 10C15.625 10.1807 15.559 10.337 15.427 10.469C15.295 10.601 15.1387 10.667 14.958 10.667H10.667V14.958C10.667 15.1387 10.601 15.295 10.469 15.427C10.337 15.559 10.1807 15.625 10 15.625Z"
        fill="#9096A5"
      />
    </g>
  </svg>
);

const QuickSearchFooter = () => {
  return (
    <StyledModalFooterContent>
      {addIcon} <span>New page</span>
    </StyledModalFooterContent>
  );
};

export default QuickSearchFooter;
