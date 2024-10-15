import type { Edge } from '@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge';
import type { Instruction } from '@atlaskit/pragmatic-drag-and-drop-hitbox/tree-item';
import { cssVar } from '@toeverything/theme';
import { assignInlineVars } from '@vanilla-extract/dynamic';
import clsx from 'clsx';
import { type ReactElement } from 'react';

import * as styles from './drop-indicator.css';

export type DropIndicatorProps = {
  instruction?: Instruction | null;
  edge?: Edge | null;
  noTerminal?: boolean;
};

function getTreeElement({
  instruction,
  isBlocked,
  noTerminal,
}: {
  instruction: Exclude<Instruction, { type: 'instruction-blocked' }>;
  isBlocked: boolean;
  noTerminal?: boolean;
}): ReactElement | null {
  const style = {
    [styles.horizontalIndent]: `${instruction.currentLevel * instruction.indentPerLevel}px`,
    [styles.indicatorColor]: !isBlocked
      ? cssVar('--affine-primary-color')
      : cssVar('--affine-warning-color'),
  };

  if (instruction.type === 'reorder-above') {
    return (
      <div
        className={clsx(styles.treeLine, styles.lineAboveStyles)}
        style={assignInlineVars(style)}
        data-no-terminal={noTerminal}
      />
    );
  }
  if (instruction.type === 'reorder-below') {
    return (
      <div
        className={clsx(styles.treeLine, styles.lineBelowStyles)}
        style={assignInlineVars(style)}
        data-no-terminal={noTerminal}
      />
    );
  }

  if (instruction.type === 'make-child') {
    return (
      <div
        className={clsx(styles.outlineStyles)}
        style={assignInlineVars(style)}
        data-no-terminal={noTerminal}
      />
    );
  }

  if (instruction.type === 'reparent') {
    style[styles.horizontalIndent] = `${
      instruction.desiredLevel * instruction.indentPerLevel
    }px`;

    return (
      <div
        className={clsx(styles.treeLine, styles.lineBelowStyles)}
        style={assignInlineVars(style)}
        data-no-terminal={noTerminal}
      />
    );
  }
  return null;
}

type Orientation = 'horizontal' | 'vertical';

const edgeToOrientationMap: Record<Edge, Orientation> = {
  top: 'horizontal',
  bottom: 'horizontal',
  left: 'vertical',
  right: 'vertical',
};

const orientationStyles: Record<Orientation, string> = {
  horizontal: styles.horizontal,
  vertical: styles.vertical,
};

const edgeStyles: Record<Edge, string> = {
  top: styles.top,
  bottom: styles.bottom,
  left: styles.left,
  right: styles.right,
};

function getEdgeElement(edge: Edge, gap: number = 0, noTerminal?: boolean) {
  const lineOffset = `calc(-0.5 * (${gap}px + 2px))`;

  const orientation = edgeToOrientationMap[edge];

  return (
    <div
      data-no-terminal={noTerminal}
      className={clsx([
        styles.edgeLine,
        orientationStyles[orientation],
        edgeStyles[edge],
      ])}
      style={assignInlineVars({ [styles.localLineOffset]: lineOffset })}
    />
  );
}

export function DropIndicator({
  instruction,
  edge,
  noTerminal,
}: DropIndicatorProps) {
  if (edge) {
    return getEdgeElement(edge, 0, noTerminal);
  }
  if (instruction) {
    if (instruction.type === 'instruction-blocked') {
      return getTreeElement({
        instruction: instruction.desired,
        isBlocked: true,
      });
    }
    return getTreeElement({ instruction, isBlocked: false });
  }
  return;
}
