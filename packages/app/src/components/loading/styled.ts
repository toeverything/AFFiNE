import { styled } from '@/styles';

// Inspired by https://codepen.io/graphilla/pen/rNvBMYY
const loadingItemSize = '40px';
export const StyledLoading = styled.div`
  position: relative;
  left: 50%;
  transform: rotateX(55deg) rotateZ(-45deg)
    translate(calc(${loadingItemSize} * -2), 0);
  margin-bottom: calc(3 * ${loadingItemSize});

  @keyframes slide {
    0% {
      transform: translate(var(--sx), var(--sy));
    }
    65% {
      transform: translate(var(--ex), var(--sy));
    }
    95%,
    100% {
      transform: translate(var(--ex), var(--ey));
    }
  }
  @keyframes load {
    20% {
      content: '.';
    }
    40% {
      content: '..';
    }
    80%,
    100% {
      content: '...';
    }
  }
`;

export const StyledLoadingItem = styled.div`
  position: absolute;
  width: ${loadingItemSize};
  height: ${loadingItemSize};
  background: #9dacf9;
  animation: slide 0.9s cubic-bezier(0.65, 0.53, 0.59, 0.93) infinite;

  &::before,
  &::after {
    content: '';
    position: absolute;
    width: 100%;
    height: 100%;
  }

  &::before {
    background: #5260b9;
    transform: skew(0deg, -45deg);
    right: 100%;
    top: 50%;
  }

  &::after {
    background: #6880ff;
    transform: skew(-45deg, 0deg);
    top: 100%;
    right: 50%;
  }

  &:nth-of-type(1) {
    --sx: 50%;
    --sy: -50%;
    --ex: 150%;
    --ey: 50%;
  }

  &:nth-of-type(2) {
    --sx: -50%;
    --sy: -50%;
    --ex: 50%;
    --ey: -50%;
  }

  &:nth-of-type(3) {
    --sx: 150%;
    --sy: 50%;
    --ex: 50%;
    --ey: 50%;
  }

  &:nth-of-type(4) {
    --sx: 50%;
    --sy: 50%;
    --ex: -50%;
    --ey: -50%;
  }
`;
