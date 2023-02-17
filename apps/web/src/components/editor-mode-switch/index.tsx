import { useTranslation } from '@affine/i18n';
import React, { cloneElement, useEffect, useState } from 'react';

import useCurrentPageMeta from '@/hooks/use-current-page-meta';
import { usePageHelper } from '@/hooks/use-page-helper';
import { useTheme } from '@/providers/ThemeProvider';

import { EdgelessIcon, PaperIcon } from './Icons';
import {
  StyledAnimateRadioContainer,
  StyledIcon,
  StyledLabel,
  StyledMiddleLine,
  StyledRadioItem,
} from './style';
import type {
  AnimateRadioItemProps,
  AnimateRadioProps,
  RadioItemStatus,
} from './type';
const PaperItem = ({ active }: { active?: boolean }) => {
  const {
    theme: {
      colors: { iconColor, primaryColor },
    },
  } = useTheme();

  return <PaperIcon style={{ color: active ? primaryColor : iconColor }} />;
};

const EdgelessItem = ({ active }: { active?: boolean }) => {
  const {
    theme: {
      colors: { iconColor, primaryColor },
    },
  } = useTheme();

  return <EdgelessIcon style={{ color: active ? primaryColor : iconColor }} />;
};

const AnimateRadioItem = ({
  active,
  status,
  icon: propsIcon,
  label,
  isLeft,
  ...props
}: AnimateRadioItemProps) => {
  const icon = (
    <StyledIcon shrink={status === 'shrink'} isLeft={isLeft}>
      {cloneElement(propsIcon, {
        active,
      })}
    </StyledIcon>
  );
  return (
    <StyledRadioItem title={label} active={active} status={status} {...props}>
      {isLeft ? icon : null}
      <StyledLabel shrink={status !== 'stretch'} isLeft={isLeft}>
        {label}
      </StyledLabel>
      {isLeft ? null : icon}
    </StyledRadioItem>
  );
};

export const EditorModeSwitch = ({
  isHover,
  style = {},
}: AnimateRadioProps) => {
  const { mode: themeMode } = useTheme();
  const { changePageMode } = usePageHelper();
  const { trash, mode = 'page', id = '' } = useCurrentPageMeta() || {};

  const modifyRadioItemStatus = (): RadioItemStatus => {
    return {
      left: isHover
        ? mode === 'page'
          ? 'stretch'
          : 'normal'
        : mode === 'page'
        ? 'shrink'
        : 'hidden',
      right: isHover
        ? mode === 'edgeless'
          ? 'stretch'
          : 'normal'
        : mode === 'edgeless'
        ? 'shrink'
        : 'hidden',
    };
  };
  const [radioItemStatus, setRadioItemStatus] = useState<RadioItemStatus>(
    modifyRadioItemStatus
  );

  useEffect(() => {
    setRadioItemStatus(modifyRadioItemStatus());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHover, mode]);
  const { t } = useTranslation();
  return (
    <StyledAnimateRadioContainer
      data-testid="editor-mode-switcher"
      shrink={!isHover}
      style={style}
      disabled={!!trash}
    >
      <AnimateRadioItem
        isLeft={true}
        label={t('Paper')}
        icon={<PaperItem />}
        active={mode === 'page'}
        status={radioItemStatus.left}
        onClick={() => {
          changePageMode(id, 'page');
        }}
        onMouseEnter={() => {
          setRadioItemStatus({
            right: 'normal',
            left: 'stretch',
          });
        }}
        onMouseLeave={() => {
          setRadioItemStatus(modifyRadioItemStatus());
        }}
      />
      <StyledMiddleLine hidden={!isHover} dark={themeMode === 'dark'} />
      <AnimateRadioItem
        isLeft={false}
        label={t('Edgeless')}
        data-testid="switch-edgeless-item"
        icon={<EdgelessItem />}
        active={mode === 'edgeless'}
        status={radioItemStatus.right}
        onClick={() => {
          changePageMode(id, 'edgeless');
        }}
        onMouseEnter={() => {
          setRadioItemStatus({
            left: 'normal',
            right: 'stretch',
          });
        }}
        onMouseLeave={() => {
          setRadioItemStatus(modifyRadioItemStatus());
        }}
      />
    </StyledAnimateRadioContainer>
  );
};

export default EditorModeSwitch;
