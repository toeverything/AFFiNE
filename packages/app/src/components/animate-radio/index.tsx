import { useState, useEffect, cloneElement } from 'react';
import {
  StyledAnimateRadioContainer,
  StyledRadioMiddle,
  StyledMiddleLine,
  StyledRadioItem,
  StyledLabel,
  StyledIcon,
} from './style';
import { ArrowIcon } from './icons';
import type {
  RadioItemStatus,
  AnimateRadioProps,
  AnimateRadioItemProps,
} from './type';

const AnimateRadioItem = ({
  active,
  status,
  icon,
  label,
  isLeft,
  ...props
}: AnimateRadioItemProps) => {
  return (
    <StyledRadioItem active={active} status={status} {...props}>
      <StyledIcon shrink={status === 'stretch'} isLeft={isLeft}>
        {cloneElement(icon, {
          active,
        })}
      </StyledIcon>

      <StyledLabel shrink={status !== 'stretch'}>{label}</StyledLabel>
    </StyledRadioItem>
  );
};

const RadioMiddle = ({
  isHover,
  direction,
}: {
  isHover: boolean;
  direction: 'left' | 'right' | 'middle';
}) => {
  return (
    <StyledRadioMiddle hidden={!isHover}>
      <StyledMiddleLine hidden={direction !== 'middle'} />
      <ArrowIcon
        direction={direction}
        style={{
          position: 'absolute',
          left: '0',
          right: '0',
          top: '0',
          bottom: '0',
          margin: 'auto',
        }}
      ></ArrowIcon>
    </StyledRadioMiddle>
  );
};

export const AnimateRadio = ({
  labelLeft,
  labelRight,
  iconLeft,
  iconRight,
  isHover,
  style = {},
  onChange,
  initialValue = 'left',
}: AnimateRadioProps) => {
  const [active, setActive] = useState(initialValue);
  const modifyRadioItemStatus = (): RadioItemStatus => {
    return {
      left: !isHover && active === 'right' ? 'shrink' : 'normal',
      right: !isHover && active === 'left' ? 'shrink' : 'normal',
    };
  };
  const [radioItemStatus, setRadioItemStatus] = useState<RadioItemStatus>(
    modifyRadioItemStatus
  );

  useEffect(() => {
    setRadioItemStatus(modifyRadioItemStatus());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHover, active]);

  return (
    <StyledAnimateRadioContainer shrink={!isHover} style={style}>
      <AnimateRadioItem
        isLeft={true}
        label={labelLeft}
        icon={iconLeft}
        active={active === 'left'}
        status={radioItemStatus.left}
        onClick={() => {
          setActive('left');
          onChange?.('left');
        }}
        onMouseEnter={() => {
          setRadioItemStatus({
            right: 'normal',
            left: 'stretch',
          });
        }}
        onMouseLeave={() => {
          setRadioItemStatus({
            ...radioItemStatus,
            left: 'normal',
          });
        }}
      />
      <RadioMiddle
        isHover={isHover}
        direction={
          radioItemStatus.left === 'stretch'
            ? 'left'
            : radioItemStatus.right === 'stretch'
            ? 'right'
            : 'middle'
        }
      />
      <AnimateRadioItem
        isLeft={false}
        label={labelRight}
        icon={iconRight}
        active={active === 'right'}
        status={radioItemStatus.right}
        onClick={() => {
          setActive('right');
          onChange?.('right');
        }}
        onMouseEnter={() => {
          setRadioItemStatus({
            left: 'normal',
            right: 'stretch',
          });
        }}
        onMouseLeave={() => {
          setRadioItemStatus({
            ...radioItemStatus,
            right: 'normal',
          });
        }}
      />
    </StyledAnimateRadioContainer>
  );
};

export default AnimateRadio;
