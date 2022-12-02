import React, { useState } from 'react';
import Router from 'next/router';
import {
  StyledArrowButton,
  StyledListItem,
  StyledNewPageButton,
  StyledSliderBar,
  StyledSubListItem,
} from './style';
import { Arrow } from './icons';
export const WorkSpaceSliderBar = () => {
  const [show, setShow] = useState(false);
  return (
    <>
      <StyledSliderBar show={show}>
        <StyledListItem>Quick search</StyledListItem>
        <StyledListItem
          onClick={() => {
            Router.push('/all-page');
          }}
        >
          All pages
        </StyledListItem>
        <StyledListItem>Favourites</StyledListItem>
        <StyledSubListItem>
          document 1, this is a paper icondocument 1
        </StyledSubListItem>
        <StyledSubListItem>document 2</StyledSubListItem>
        <StyledSubListItem>document 4</StyledSubListItem>
        <StyledListItem>Import</StyledListItem>
        <StyledListItem>Bin</StyledListItem>

        <StyledNewPageButton>New Page</StyledNewPageButton>
      </StyledSliderBar>
      <StyledArrowButton
        isShow={show}
        onClick={() => {
          setShow(!show);
        }}
      >
        <Arrow />
      </StyledArrowButton>
    </>
  );
};

export default WorkSpaceSliderBar;
