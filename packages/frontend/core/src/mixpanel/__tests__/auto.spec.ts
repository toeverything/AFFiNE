/**
 * @vitest-environment happy-dom
 */
import { beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';

import { enableAutoTrack, makeTracker } from '../auto';

describe('callable events chain', () => {
  const call = vi.fn();
  const track = makeTracker(call);

  beforeEach(() => {
    call.mockClear();
  });

  test('should call track with event and props', () => {
    // @ts-expect-error fake chain
    track.pageA.segmentA.moduleA.eventA();

    expect(call).toBeCalledWith('eventA', {
      page: 'pageA',
      segment: 'segmentA',
      module: 'moduleA',
    });
  });

  test('should be able to override props', () => {
    // @ts-expect-error fake chain
    track.pageA.segmentA.moduleA.eventA({ page: 'pageB', control: 'controlA' });

    expect(call).toBeCalledWith('eventA', {
      page: 'pageB',
      segment: 'segmentA',
      module: 'moduleA',
      control: 'controlA',
    });
  });

  test('should be able to append custom props', () => {
    // @ts-expect-error fake chain
    track.pageA.segmentA.moduleA.eventA({ custom: 'prop' });

    expect(call).toBeCalledWith('eventA', {
      page: 'pageA',
      segment: 'segmentA',
      module: 'moduleA',
      custom: 'prop',
    });
  });

  test('should be able to ignore matrix named with placeholder `$`', () => {
    // @ts-expect-error fake chain
    track.$.segmentA.moduleA.eventA();
    // @ts-expect-error fake chain
    track.pageA.$.moduleA.eventA();
    // @ts-expect-error fake chain
    track.pageA.segmentA.$.eventA();
    // @ts-expect-error fake chain
    track.$.$.$.eventA();

    const args = [
      {
        segment: 'segmentA',
        module: 'moduleA',
      },
      {
        page: 'pageA',
        module: 'moduleA',
      },
      {
        page: 'pageA',
        segment: 'segmentA',
      },
      {},
    ];

    args.forEach((arg, i) => {
      expect(call).toHaveBeenNthCalledWith(i + 1, 'eventA', arg);
    });
  });
});

describe('auto track with dom dataset', () => {
  const root = document.createElement('div');
  const call = vi.fn();
  beforeAll(() => {
    call.mockReset();
    root.innerHTML = '';
    return enableAutoTrack(root, call);
  });

  test('should ignore if data-event-props not set', () => {
    const nonTrackBtn = document.createElement('button');
    root.append(nonTrackBtn);

    nonTrackBtn.click();

    expect(call).not.toBeCalled();
  });

  test('should track event with props', () => {
    const btn = document.createElement('button');
    btn.dataset.eventProps = 'allDocs.header.actions.createDoc';
    root.append(btn);

    btn.click();

    expect(call).toBeCalledWith('createDoc', {
      page: 'allDocs',
      segment: 'header',
      module: 'actions',
    });
  });

  test('should track event with single', () => {
    const btn = document.createElement('button');
    btn.dataset.eventProps = 'allDocs.header.actions.createDoc';
    btn.dataset.eventArg = 'test';
    root.append(btn);

    btn.click();

    expect(call).toBeCalledWith('createDoc', {
      page: 'allDocs',
      segment: 'header',
      module: 'actions',
      arg: 'test',
    });
  });

  test('should track event with multiple args', () => {
    const btn = document.createElement('button');
    btn.dataset.eventProps = 'allDocs.header.actions.createDoc';
    btn.dataset.eventArgsFoo = 'bar';
    btn.dataset.eventArgsBaz = 'qux';
    root.append(btn);

    btn.click();

    expect(call).toBeCalledWith('createDoc', {
      page: 'allDocs',
      segment: 'header',
      module: 'actions',
      foo: 'bar',
      baz: 'qux',
    });
  });
});
