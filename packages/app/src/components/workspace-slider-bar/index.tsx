import React, { useState } from 'react';
import { useRouter } from 'next/router';
import {
  StyledArrowButton,
  StyledListItem,
  StyledNewPageButton,
  StyledSliderBar,
  StyledSubListItem,
} from './style';
import { Arrow } from './icons';
import Link from 'next/link';
export const WorkSpaceSliderBar = () => {
  const [show, setShow] = useState(false);
  const router = useRouter();
  return (
    <>
      <StyledSliderBar show={show}>
        <StyledListItem>Quick search</StyledListItem>

        <StyledListItem
          onClick={() => {
            router.push({
              pathname: '/',
              query: {
                pageId: new Date().getTime().toString(),
              },
            });
          }}
        >
          Back to Doc
        </StyledListItem>
        <StyledListItem>
          <Link href={{ pathname: '/all-page', query: { name: 'test' } }}>
            All pages
          </Link>
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
