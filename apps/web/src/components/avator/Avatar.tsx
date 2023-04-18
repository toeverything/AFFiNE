import type { CSSProperties } from 'react';
import { useState } from 'react';

import {
  StyledBottomItem,
  StyledContainer,
  StyledMiddleItem,
  StyledTopItem,
} from './styles';

export const Avatar = ({
  colors,
}: {
  colors: [
    CSSProperties['color'],
    CSSProperties['color'],
    CSSProperties['color']
  ];
}) => {
  const [topColor, middleColor, bottomColor] = colors;
  const [isHover, setIsHover] = useState(false);

  return (
    <StyledContainer
      onMouseEnter={() => setIsHover(true)}
      onMouseLeave={() => setIsHover(false)}
    >
      <StyledBottomItem color={bottomColor} startAnimate={isHover} />
      <StyledMiddleItem color={middleColor} startAnimate={isHover} />
      <StyledTopItem color={topColor} startAnimate={isHover} />
    </StyledContainer>
  );
};
export default Avatar;
