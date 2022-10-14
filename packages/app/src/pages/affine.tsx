import type { ReactNode } from 'react';
import { useRef, useState, useEffect } from 'react';
import { styled } from '@/styles';
import { PaperIcon, EdgelessIcon } from '../components/Header/icons';
export const StyledHeader = styled('div')({
  height: '60px',
  width: '100vw',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  position: 'relative',
  padding: '0 22px',
  borderBottom: '1px solid #e5e5e5',
});

export const StyledAnimateRadio = styled('div')<{ shrink: boolean }>(
  ({ shrink }) => {
    const shrinkStyle = shrink
      ? {
          width: '66px',
          background: 'transparent',
          '::after': {
            opacity: '0',
          },
        }
      : {};
    return {
      border: '1px solid #e5e5e5',
      width: '132px',
      height: '36px',
      borderRadius: '18px',
      background: '#F1F3FF',
      position: 'relative',
      display: 'flex',
      transition:'all .3s',
      '::after': {
        content: '""',
        width: '1px',
        height: '14px',
        background: '#D0D7E3',
        position: 'absolute',
        left: '0',
        right: '0',
        top: '0',
        bottom: '0',
        margin: 'auto',
      },
      ...shrinkStyle,
    };
  }
);

export const StyledAnimateRadioItem = styled('div')<{
  active: boolean;
  shrink: boolean;
}>(({ shrink }) => {
  const shrinkStyle = shrink
    ? {
        width: '100%',
        display: 'none',
      }
    : {};
  return {
    width: '66px',
    height: '100%',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    ...shrinkStyle,
  };
});

type AnimateRadioProps = {
  labelLeft: ReactNode;
  labelRight: ReactNode;
};

const AnimateRadio = ({ labelLeft, labelRight }: AnimateRadioProps) => {
  const [active, setActive] = useState('left');
  const [isHover, setIsHover] = useState(false);
  const isAnimating = useRef(false);
  const stretch = () => {
    !isAnimating.current && setIsHover(true);
  };
  const shrink = () => {
    !isAnimating.current && setIsHover(false);
  };

  useEffect(() => {
    // isAnimating.current = true;
    // setTimeout(() => {
    //   isAnimating.current = false;
    // }, 500);
  }, [isHover]);

  return (
    <StyledAnimateRadio
      shrink={isHover}
      onMouseEnter={() => {
        stretch();
      }}
      onMouseLeave={() => {
        shrink();
      }}
    >
      <StyledAnimateRadioItem
        active={active === 'left'}
        shrink={isHover && active === 'right'}
        onClick={() => {
          setActive('left');
        }}
      >
        {labelLeft}
      </StyledAnimateRadioItem>
      <StyledAnimateRadioItem
        active={active === 'right'}
        shrink={isHover && active === 'left'}
        onClick={() => {
          setActive('right');
        }}
      >
        {labelRight}
      </StyledAnimateRadioItem>
    </StyledAnimateRadio>
  );
};

const Affine = () => {
  return (
    <StyledHeader>
      <AnimateRadio labelLeft={<PaperIcon />} labelRight={<EdgelessIcon />} />
    </StyledHeader>
  );
};

export default Affine;
