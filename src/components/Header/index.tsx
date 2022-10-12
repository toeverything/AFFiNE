import React from 'react';
import { styled } from '@/styles';

const StyledHeader = styled('div')({
  height: '60px',
  width: '100vh',
  borderBottom: '1px solid gray',
});
export const Header = () => {
  return <StyledHeader>Here is header</StyledHeader>;
};
