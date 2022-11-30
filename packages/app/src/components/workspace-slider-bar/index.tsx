import React, { useState } from 'react';
import {
  StyledArrowButton,
  StyledListItem,
  StyledSliderBar,
  StyledSubListItem,
  StyledWrapper,
} from './style';
import { Arrow } from './icons';

export const WorkSpaceSliderBar = () => {
  const [show, setShow] = useState(false);
  return (
    <>

      <StyledSliderBar show={show}>

        <StyledListItem>Quick search</StyledListItem>
        <StyledListItem>All pages</StyledListItem>
        <StyledListItem>Favourites</StyledListItem>
        <StyledSubListItem>
          document 1, this is a paper icondocument 1
        </StyledSubListItem>
        <StyledSubListItem>document 2</StyledSubListItem>
        <StyledSubListItem>document 4</StyledSubListItem>
        <StyledListItem>Import</StyledListItem>
        <StyledListItem>Bin</StyledListItem>
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
