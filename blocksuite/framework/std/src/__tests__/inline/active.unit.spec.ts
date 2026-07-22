/**
 * @vitest-environment happy-dom
 */
import { afterEach, describe, expect, test } from 'vitest';

import { shouldDeactivateEditorOnFocusOut } from '../../inline/range/active.js';
import { RANGE_SYNC_EXCLUDE_ATTR } from '../../inline/range/consts.js';

afterEach(() => {
  document.body.replaceChildren();
});

describe('editor active helpers', () => {
  test('keeps editor active when focus moves into an excluded widget', () => {
    const host = document.createElement('editor-host');
    const paragraph = document.createElement('div');
    host.append(paragraph);

    const widgetRoot = document.createElement('div');
    widgetRoot.setAttribute(RANGE_SYNC_EXCLUDE_ATTR, 'true');
    const widgetButton = document.createElement('button');
    widgetRoot.append(widgetButton);

    document.body.append(host, widgetRoot);

    expect(shouldDeactivateEditorOnFocusOut(host, widgetButton)).toBe(false);
  });

  test('keeps editor active when focus stays inside the editor host', () => {
    const host = document.createElement('editor-host');
    const input = document.createElement('input');
    host.append(input);
    document.body.append(host);

    expect(shouldDeactivateEditorOnFocusOut(host, input)).toBe(false);
  });

  test('deactivates editor when focus moves to a regular external control', () => {
    const host = document.createElement('editor-host');
    const paragraph = document.createElement('div');
    host.append(paragraph);

    const externalButton = document.createElement('button');
    document.body.append(host, externalButton);

    expect(shouldDeactivateEditorOnFocusOut(host, externalButton)).toBe(true);
  });

  test('keeps editor active on focusout when related target is null', () => {
    // Focus leaving to nowhere (e.g. block-level selection) must not deactivate
    // the editor via `focusout`; the host `blur` handler owns that case.
    const host = document.createElement('editor-host');
    document.body.append(host);

    expect(shouldDeactivateEditorOnFocusOut(host, null)).toBe(false);
  });

  test('keeps editor active when the related target is not a DOM node', () => {
    const host = document.createElement('editor-host');
    document.body.append(host);

    expect(shouldDeactivateEditorOnFocusOut(host, new EventTarget())).toBe(
      false
    );
  });
});
