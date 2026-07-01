import { Window } from 'happy-dom';
import { describe, expect, test } from 'vitest';

import * as activeModule from '../../inline/range/active.js';
import { RANGE_SYNC_EXCLUDE_ATTR } from '../../inline/range/consts.js';

const window = new Window();
Object.assign(globalThis, {
  document: window.document,
  Element: window.Element,
  Node: window.Node,
});

describe('editor active helpers', () => {
  test('keeps editor active when focus moves into an excluded widget', () => {
    const helper = (activeModule as Record<string, unknown>)
      .shouldDeactivateEditorOnFocusOut;

    expect(typeof helper).toBe('function');

    const host = document.createElement('editor-host');
    const paragraph = document.createElement('div');
    host.append(paragraph);

    const widgetRoot = document.createElement('div');
    widgetRoot.setAttribute(RANGE_SYNC_EXCLUDE_ATTR, 'true');
    const widgetButton = document.createElement('button');
    widgetRoot.append(widgetButton);

    document.body.append(host, widgetRoot);

    expect(
      (
        helper as (
          host: HTMLElement,
          relatedTarget: EventTarget | null
        ) => boolean
      )(host, widgetButton)
    ).toBe(false);

    host.remove();
    widgetRoot.remove();
  });

  test('deactivates editor when focus moves to a regular external control', () => {
    const helper = (activeModule as Record<string, unknown>)
      .shouldDeactivateEditorOnFocusOut;

    expect(typeof helper).toBe('function');

    const host = document.createElement('editor-host');
    const paragraph = document.createElement('div');
    host.append(paragraph);

    const externalButton = document.createElement('button');
    document.body.append(host, externalButton);

    expect(
      (
        helper as (
          host: HTMLElement,
          relatedTarget: EventTarget | null
        ) => boolean
      )(host, externalButton)
    ).toBe(true);

    host.remove();
    externalButton.remove();
  });
});
