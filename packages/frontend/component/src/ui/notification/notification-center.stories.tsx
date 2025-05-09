import { SingleSelectCheckSolidIcon } from '@blocksuite/icons/rc';
import type { StoryFn } from '@storybook/react';
import { cssVar } from '@toeverything/theme';
import { type HTMLAttributes, useState } from 'react';

import { Button } from '../button';
import { Modal } from '../modal';
import { NotificationCenter, notify } from '.';
import type {
  NotificationCustomRendererProps,
  NotificationStyle,
  NotificationTheme,
} from './types';
import {
  getCardBorderColor,
  getCardColor,
  getCardForegroundColor,
} from './utils';

export default {
  title: 'UI/NotificationCenter',
};

const themes: NotificationTheme[] = ['info', 'success', 'warning', 'error'];
const styles: NotificationStyle[] = ['normal', 'information', 'alert'];

const Root = ({ children, ...attrs }: HTMLAttributes<HTMLDivElement>) => (
  <>
    <NotificationCenter />
    <div {...attrs}>{children}</div>
  </>
);
const Label = ({ children, ...attrs }: HTMLAttributes<HTMLSpanElement>) => (
  <span style={{ fontWeight: 400, opacity: 0.5 }} {...attrs}>
    {children}:&nbsp;
  </span>
);

export const ThemeAndStyle: StoryFn = () => {
  return (
    <Root>
      {styles.map(style => {
        return (
          <div key={style} style={{ marginBottom: 20 }}>
            <h3 style={{ marginBottom: 8 }}>
              <Label>style</Label>
              {style}
            </h3>
            <div style={{ display: 'flex', gap: 4 }}>
              {themes.map(theme => {
                return (
                  <Button
                    style={{
                      backgroundColor: getCardColor(style, theme),
                      borderColor: getCardBorderColor(style),
                      color: getCardForegroundColor(style),
                    }}
                    key={theme}
                    onClick={() =>
                      notify({
                        title: `${theme} title`,
                        message: (
                          <span>
                            Test with <Label>style</Label>
                            <code>{style}</code>
                            &nbsp;and&nbsp;
                            <Label>theme</Label>
                            <code>{theme}</code>
                          </span>
                        ),
                        style,
                        theme,
                      })
                    }
                  >
                    <Label>theme</Label> {theme}
                  </Button>
                );
              })}
            </div>
          </div>
        );
      })}
    </Root>
  );
};

export const CustomIcon: StoryFn = () => {
  const icons = [
    { label: 'No icon', icon: null },
    {
      label: 'SingleSelectIcon',
      icon: <SingleSelectCheckSolidIcon />,
    },
    {
      label: 'Icon Color',
      icon: <SingleSelectCheckSolidIcon color={cssVar('successColor')} />,
    },
  ];

  return (
    <Root style={{ display: 'flex', gap: 4 }}>
      {icons.map(({ label, icon }) => (
        <Button
          key={label}
          onClick={() =>
            notify({
              title: label,
              message: 'test with custom icon ' + label,
              icon,
            })
          }
        >
          {label}
        </Button>
      ))}
    </Root>
  );
};

export const CustomRenderer: StoryFn = () => {
  const CustomRender = ({ onDismiss }: NotificationCustomRendererProps) => {
    return (
      <div
        style={{
          border: '1px solid ' + cssVar('borderColor'),
          padding: 16,
          borderRadius: 4,
          background: cssVar('white'),
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        CustomRenderer
        <Button onClick={onDismiss}>Close</Button>
      </div>
    );
  };

  return (
    <Root>
      <Button onClick={() => notify.custom(CustomRender)}>
        Open CustomRenderer
      </Button>
    </Root>
  );
};

export const WithAction: StoryFn = () => {
  return (
    <Root>
      {styles.map(style => {
        return (
          <div key={style} style={{ marginBottom: 20 }}>
            <h3 style={{ marginBottom: 8 }}>
              <Label>style</Label>
              {style}
            </h3>
            <div style={{ display: 'flex', gap: 4 }}>
              {themes.map(theme => {
                return (
                  <Button
                    style={{
                      backgroundColor: getCardColor(style, theme),
                      borderColor: getCardBorderColor(style),
                      color: getCardForegroundColor(style),
                    }}
                    key={theme}
                    onClick={() =>
                      notify({
                        title: `${theme} title`,
                        message: (
                          <span>
                            Test with <Label>style</Label>
                            <code>{style}</code>
                            &nbsp;and&nbsp;
                            <Label>theme</Label>
                            <code>{theme}</code>
                          </span>
                        ),
                        style,
                        theme,
                        actions: [
                          {
                            key: 'undo',
                            label: 'UNDO',
                            onClick: () => console.log('undo'),
                          },
                        ],
                      })
                    }
                  >
                    <Label>theme</Label> {theme}
                  </Button>
                );
              })}
            </div>
          </div>
        );
      })}

      <h3 style={{ marginBottom: 8 }}>Disable auto close</h3>
      <Button
        onClick={() => {
          notify(
            {
              title: 'Disable auto close',
              message: 'Test with disable auto close',
              actions: [
                {
                  key: 'undo',
                  label: 'UNDO',
                  onClick: () => console.log('undo'),
                  autoClose: false,
                },
              ],
            },
            { duration: 22222222 }
          );
        }}
      >
        Do not close after action clicked
      </Button>
    </Root>
  );
};

export const ZIndexWithModal: StoryFn = () => {
  const [open, setOpen] = useState(false);

  return (
    <Root>
      <Button onClick={() => setOpen(true)}>Open modal</Button>
      <Modal open={open} onOpenChange={setOpen}>
        <Button
          onClick={() =>
            notify(
              { title: 'Notify', message: 'Test with modal' },
              { duration: 2000000 }
            )
          }
        >
          Notify
        </Button>
      </Modal>
    </Root>
  );
};

export const DifferentSize: StoryFn = () => {
  const openTiny = () => {
    notify({ title: 'Tiny' }, { duration: 60000 });
  };
  const openNormal = () =>
    notify(
      {
        title: 'Normal Size',
        message: 'With basic title and one line message',
      },
      { duration: 60000 }
    );

  const openLarge = () => {
    notify(
      {
        title: 'Large Size',
        message: (
          <div>
            <h1>Large Size</h1>
            <p>
              With long title and long message to test the size of the
              notification; The content may be multiline and the card will be
              larger.
            </p>
          </div>
        ),
      },
      { duration: 60000 }
    );
  };
  const openWithThumb = () => {
    notify(
      {
        thumb: (
          <div
            style={{
              height: 100,
              background: 'rgba(100,100,100,.05)',
              lineHeight: '100px',
              textAlign: 'center',
              borderTopLeftRadius: 'inherit',
              borderTopRightRadius: 'inherit',
            }}
          >
            Hack thumb
          </div>
        ),
        title: 'Card with thumb',
        message: 'With basic title and one line message',
      },
      { duration: 60000 }
    );
  };
  return (
    <Root style={{ display: 'flex', gap: 8 }}>
      <Button onClick={openTiny}>Open Tiny</Button>
      <Button onClick={openNormal}>Open Normal</Button>
      <Button onClick={openLarge}>Open Large</Button>
      <Button onClick={openWithThumb}>Open with thumb</Button>
    </Root>
  );
};
