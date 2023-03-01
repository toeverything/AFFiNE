import { useTranslation } from '@affine/i18n';
import { assertExists } from '@blocksuite/store';
import React, { cloneElement, CSSProperties, useEffect, useState } from 'react';

import {
  usePageMeta,
  usePageMetaHelper,
} from '../../../../hooks/use-page-meta';
// todo(himself65): remove `useTheme` hook
import { useTheme } from '../../../../providers/ThemeProvider';
import { BlockSuiteWorkspace } from '../../../../shared';
import { EdgelessIcon, PaperIcon } from './Icons';
import {
  StyledAnimateRadioContainer,
  StyledIcon,
  StyledLabel,
  StyledMiddleLine,
  StyledRadioItem,
} from './style';
import type { AnimateRadioItemProps, RadioItemStatus } from './type';
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

export type EditorModeSwitchProps = {
  // todo(himself65): combine these two properties
  blockSuiteWorkspace: BlockSuiteWorkspace;
  pageId: string;
  isHover: boolean;
  style: CSSProperties;
};

export const EditorModeSwitch: React.FC<EditorModeSwitchProps> = ({
  isHover,
  style = {},
  blockSuiteWorkspace,
  pageId,
}) => {
  const { mode: themeMode } = useTheme();
  const { setPageMeta } = usePageMetaHelper(blockSuiteWorkspace);
  const pageMeta = usePageMeta(blockSuiteWorkspace).find(
    meta => meta.id === pageId
  );
  assertExists(pageMeta);
  const { trash, mode = 'page' } = pageMeta;

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
          setPageMeta(pageId, { mode: 'page' });
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
          setPageMeta(pageId, { mode: 'edgeless' });
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
