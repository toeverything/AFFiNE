import type { Meta } from '@storybook/react';
import type { CSSProperties, ReactNode } from 'react';

import { Button } from '../button';
import { Divider } from '../divider';

export default {
  title: 'UI/Frame Audit',
} satisfies Meta;

interface AuditOptions {
  role?: 'divider' | 'overlay';
  text?: boolean;
  ellipsis?: boolean;
  baseline?: string;
  footer?: [group: string, priority: number];
}

/** Marks an element for the geometry snapshot read by `harness.tsx`. */
const audit = (id: string, options: AuditOptions = {}) => ({
  'data-audit-id': id,
  'data-audit-role': options.role,
  'data-audit-text': options.text ? '' : undefined,
  'data-audit-ellipsis': options.ellipsis ? '' : undefined,
  'data-audit-baseline': options.baseline,
  'data-audit-footer': options.footer?.join(':'),
});

const Scene = ({
  width = 480,
  children,
}: {
  width?: number;
  children: ReactNode;
}) => (
  <div
    {...audit('scene')}
    style={{ position: 'relative', width, height: 320, overflow: 'hidden' }}
  >
    {children}
  </div>
);

const line: CSSProperties = {
  display: 'block',
  width: 200,
  fontSize: 15,
  lineHeight: '24px',
};

export const FirstLineBaseline = () => (
  <Scene>
    <div
      style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: 16 }}
    >
      <span
        {...audit('row.icon', { baseline: 'row' })}
        style={{ width: 16, height: 16, marginTop: 4, background: 'gray' }}
      />
      <span
        {...audit('row.title', { text: true, baseline: 'row' })}
        style={line}
      >
        A title long enough to wrap onto a second line of this row
      </span>
      <Button
        {...audit('row.action')}
        style={{ width: 96, height: 24, flexShrink: 0 }}
      >
        Open
      </Button>
    </div>
  </Scene>
);

export const DialogFooter = () => (
  <Scene width={240}>
    <div
      {...audit('dialog')}
      style={{
        display: 'flex',
        flexWrap: 'wrap-reverse',
        gap: 8,
        width: 208,
        margin: 16,
      }}
    >
      <Button
        {...audit('dialog.confirm', { footer: ['actions', 0] })}
        variant="primary"
        style={{ width: 128, height: 32 }}
      >
        Confirm
      </Button>
      <Button
        {...audit('dialog.cancel', { footer: ['actions', 1] })}
        style={{ width: 128, height: 32 }}
      >
        Cancel
      </Button>
    </div>
  </Scene>
);

export const NestedRadii = () => (
  <Scene>
    <div
      {...audit('card')}
      style={{
        boxSizing: 'border-box',
        width: 240,
        height: 120,
        margin: 16,
        padding: 8,
        borderRadius: 16,
        background: 'var(--affine-background-secondary-color)',
      }}
    >
      <div
        {...audit('card.inner')}
        style={{ height: 104, borderRadius: 8, background: 'gray' }}
      />
    </div>
  </Scene>
);

export const DividedList = () => (
  <Scene>
    <div {...audit('list')} style={{ width: 240, margin: 16 }}>
      {['a', 'b', 'c'].flatMap((item, index) => [
        ...(index > 0
          ? [
              <Divider
                key={`divider-${item}`}
                {...audit(`list.divider-${item}`, { role: 'divider' })}
                space={4}
              />,
            ]
          : []),
        <div key={item} {...audit(`list.${item}`)} style={{ height: 24 }}>
          {item}
        </div>,
      ])}
    </div>
  </Scene>
);

export const NarrowContainer = () => (
  <Scene width={160}>
    <span
      {...audit('narrow.name', { text: true, ellipsis: true })}
      style={{
        ...line,
        width: 128,
        margin: 16,
        overflow: 'hidden',
        whiteSpace: 'nowrap',
        textOverflow: 'ellipsis',
      }}
    >
      A document name far longer than its container
    </span>
    <Button
      {...audit('narrow.action')}
      style={{ width: 128, height: 28, marginLeft: 16 }}
    >
      Rename
    </Button>
  </Scene>
);

export const FractionalThirds = () => (
  <Scene>
    <div
      {...audit('thirds')}
      style={{ display: 'flex', width: 470, margin: 5 }}
    >
      {['a', 'b', 'c'].map(cell => (
        <div
          key={cell}
          {...audit(`thirds.${cell}`)}
          style={{ flex: 1, height: 24 }}
        />
      ))}
    </div>
  </Scene>
);

export const FloatingOverlay = () => (
  <Scene>
    <Button
      {...audit('page.action')}
      style={{ width: 96, height: 28, margin: 16 }}
    >
      Behind
    </Button>
    <div
      {...audit('menu', { role: 'overlay' })}
      style={{
        position: 'absolute',
        top: 8,
        left: 8,
        boxSizing: 'border-box',
        width: 160,
        height: 64,
        padding: 4,
        borderRadius: 8,
        background: 'var(--affine-background-overlay-panel-color)',
      }}
    >
      <Button
        {...audit('menu.item')}
        style={{ width: 152, height: 28, borderRadius: 4 }}
      >
        Menu item
      </Button>
    </div>
  </Scene>
);
