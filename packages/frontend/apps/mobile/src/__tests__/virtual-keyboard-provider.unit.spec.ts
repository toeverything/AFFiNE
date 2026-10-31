/**
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createVisualViewportVirtualKeyboardProvider } from '../virtual-keyboard-provider';

/**
 * Minimal `visualViewport`-shaped `EventTarget` stub. happy-dom does not
 * implement the VisualViewport API, so we provide just enough surface
 * (settable height/width/offset/scale props + addEventListener/
 * removeEventListener/dispatchEvent) for the provider under test.
 */
class FakeVisualViewport extends EventTarget {
  height = 762;
  width = 375;
  offsetTop = 0;
  offsetLeft = 0;
  scale = 1;
}

function fireViewportEvent(
  viewport: FakeVisualViewport,
  type: 'resize' | 'scroll',
  props: Partial<
    Pick<
      FakeVisualViewport,
      'height' | 'width' | 'offsetTop' | 'offsetLeft' | 'scale'
    >
  >,
  windowInnerHeight: number
) {
  Object.assign(viewport, props);
  (globalThis as any).window.innerHeight = windowInnerHeight;
  viewport.dispatchEvent(new Event(type));
}

describe('createVisualViewportVirtualKeyboardProvider', () => {
  let viewport: FakeVisualViewport;
  let dispose: (() => void) | undefined;
  let originalVisualViewport: unknown;
  let originalInnerHeight: number;

  beforeEach(() => {
    viewport = new FakeVisualViewport();
    originalVisualViewport = (globalThis as any).visualViewport;
    originalInnerHeight = window.innerHeight;
    (globalThis as any).visualViewport = viewport;
  });

  afterEach(() => {
    dispose?.();
    dispose = undefined;
    (globalThis as any).visualViewport = originalVisualViewport;
    window.innerHeight = originalInnerHeight;
    vi.restoreAllMocks();
  });

  // Modeled on keyboard-scroll-noise-capture.log lines 18-30: a correct
  // `resize` opens the keyboard (664/385/143.65625 -> height 135.34), then
  // ~1.1s later a `scroll` event reports a stale (no-keyboard) windowHeight
  // while visualViewport.height is unchanged, producing a spurious
  // near-doubled height (271) with NO real keyboard change in between.
  it('does not treat a scroll event as a keyboard-height change (no spurious near-double jump)', () => {
    const provider = createVisualViewportVirtualKeyboardProvider();
    const callback = vi.fn();
    dispose = provider.onChange(callback);

    fireViewportEvent(
      viewport,
      'resize',
      { height: 385, offsetTop: 143.65625 },
      664
    );
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenLastCalledWith({
      visible: true,
      height: expect.closeTo(135.34375, 3),
    });

    // Real device: windowInnerHeight snaps back to the no-keyboard value
    // (762) on this `scroll` event while visualViewport.height (385) has
    // NOT changed -- nothing about the keyboard actually changed here.
    fireViewportEvent(viewport, 'scroll', { offsetTop: 106 }, 762);

    // The buggy behavior is a second callback call with height ~271 (near
    // double of 135). A correct implementation ignores this scroll event
    // entirely -- still exactly one callback call, from the resize above.
    expect(callback).toHaveBeenCalledTimes(1);
  });

  // Modeled on keyboard-scroll-noise-capture.log lines 31-38: a correct
  // `resize` closes the keyboard (762/762/0 -> height 0), then immediately a
  // `scroll` event reports a nonzero offsetTop (32) with both dimensions
  // still 762 (keyboard genuinely closed, nothing should be happening),
  // producing a nonsensical NEGATIVE computed height (-32).
  it('does not treat a scroll event as a keyboard-height change (no spurious negative height)', () => {
    const provider = createVisualViewportVirtualKeyboardProvider();
    const callback = vi.fn();
    dispose = provider.onChange(callback);

    fireViewportEvent(viewport, 'resize', { height: 762, offsetTop: 0 }, 762);
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenLastCalledWith({ visible: false, height: 0 });

    fireViewportEvent(viewport, 'scroll', { offsetTop: 32 }, 762);

    // Buggy behavior: a second callback call with height -32. Correct
    // implementation ignores this scroll event -- still exactly one call.
    expect(callback).toHaveBeenCalledTimes(1);
  });

  // Modeled on keyboard-scroll-noise-earlier-runaway-capture.log: a long run
  // of `scroll`-only events where visualViewportHeight never changes (i.e.
  // not a keyboard-size event at all) while offsetTop oscillates due to
  // ordinary content/focus-follow scroll panning. None of this should ever
  // reach the keyboard visible/height callback.
  it('ignores a burst of scroll-only events with no accompanying resize', () => {
    const provider = createVisualViewportVirtualKeyboardProvider();
    const callback = vi.fn();
    dispose = provider.onChange(callback);

    const offsets = [-7, -26, -33, -39, -52, -58, -64, -69, -75, -86];
    for (const offsetTop of offsets) {
      fireViewportEvent(viewport, 'scroll', { height: 762, offsetTop }, 762);
    }

    expect(callback).not.toHaveBeenCalled();
  });

  it('still logs [MobileDebugLog] visualViewport-event for scroll events (observability preserved)', () => {
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
    const provider = createVisualViewportVirtualKeyboardProvider();
    dispose = provider.onChange(vi.fn());

    fireViewportEvent(viewport, 'scroll', { offsetTop: 32 }, 762);

    expect(debugSpy).toHaveBeenCalledWith(
      '[MobileDebugLog] visualViewport-event',
      expect.objectContaining({ type: 'scroll' })
    );
  });

  // Modeled on affine-dev-MobileDebugLog-new-row-enter-5.log (see
  // .planning/debug/keyboard-focus-tabbar-coordination.md): a real
  // continuous keyboard-open transition where `visualViewport.height`
  // stays essentially rock-steady (~385) the entire time (the keyboard's
  // own occupied height is correctly stable), but `window.innerHeight`
  // itself swings between 539 and 762 and back down again across ~2
  // seconds of genuine `resize` events (Safari's dynamic toolbar
  // collapsing/expanding independently of the keyboard) -- the prior
  // resize-only fix (keyboard-scroll-noise.md) does not help here since
  // every one of these is already a real `resize`, not `scroll`, event.
  // Feeding the live, chrome-collapse-affected `window.innerHeight`
  // straight into the height computation on every event produces
  // negative computed heights mid-transition, which get written directly
  // into the keyboard-toolbar/tab-bar CSS offset -- the reported
  // mis-stacking/covering symptom.
  const newRowEnter5ResizeSequence: [
    windowInnerHeight: number,
    visualViewportHeight: number,
    visualViewportOffsetTop: number,
  ][] = [
    [559, 384.984375, 203.328125],
    [563, 385, 198.65625],
    [595, 384.984375, 192.328125],
    [623, 385, 202.65625],
    [617, 384.984375, 209.328125],
    [630, 385, 213],
    [619, 384.984375, 221.328125],
    [596, 385, 224.65625],
    [568, 384.984375, 226.328125],
    [539, 385, 225.65625],
    [540, 384.984375, 222.328125],
    [541, 385, 220.65625],
    [545, 384.984375, 217.328125],
    [546, 385, 216],
    [549, 384.984375, 213.328125],
    [550, 385, 212],
    [556, 384.984375, 206.328125],
    [559, 385, 202.65625],
    [578, 384.984375, 201.328125],
    [600, 385, 199.65625],
    [629, 384.984375, 194.328125],
    [665, 385, 193],
    [706, 384.984375, 189.328125],
    [752, 385, 188],
    [762, 384.984375, 186.328125],
    [727, 385, 304.65625],
    [762, 762, 0],
    [598, 385, 209.65625],
  ];

  it('never reports a negative keyboard height while window.innerHeight fluctuates mid-transition (Safari chrome-collapse noise)', () => {
    const provider = createVisualViewportVirtualKeyboardProvider();
    const callback = vi.fn();
    dispose = provider.onChange(callback);

    for (const [
      windowInnerHeight,
      height,
      offsetTop,
    ] of newRowEnter5ResizeSequence) {
      fireViewportEvent(
        viewport,
        'resize',
        { height, offsetTop },
        windowInnerHeight
      );
    }

    // round 2 (keyboard-focus-tabbar-coordination): with the
    // visualViewport.height-change gate added on top of this fix, almost
    // every event in this sequence has visualViewport.height alternating
    // between 384.984375/385 (sub-pixel jitter, well under the 1px
    // epsilon) — none of those are genuine keyboard transitions, so they
    // are now suppressed entirely instead of each producing its own
    // (merely non-negative, but still bouncing) callback call. Only 3
    // calls should fire: the seed (event 1), the sequence's genuine
    // keyboard-close event (event 27, 762/762/0), and the genuine reopen
    // that follows it (event 28).
    expect(callback).toHaveBeenCalledTimes(3);
    for (const call of callback.mock.calls) {
      const [{ height }] = call as [{ visible: boolean; height: number }];
      expect(height).toBeGreaterThanOrEqual(0);
    }

    expect(callback).toHaveBeenNthCalledWith(1, { visible: true, height: 0 });
    expect(callback).toHaveBeenNthCalledWith(2, { visible: false, height: 0 });
    expect(callback).toHaveBeenNthCalledWith(3, {
      visible: true,
      height: expect.closeTo(167.34375, 3),
    });
  });

  // Modeled on affine-dev-MobileDebugLog-new-row-enter-6.log (round 2, see
  // .planning/debug/keyboard-focus-tabbar-coordination.md "Current Focus
  // (Round 2)" for the fresh on-device report this replays). Here
  // `window.innerHeight` stays perfectly constant (812) — fix 2b's own
  // failure mode does not apply — and `visualViewport.height` (the
  // keyboard's own occupied footprint) also stays rock-steady (~435,
  // sub-pixel jitter only) for the entire real capture, yet
  // `visualViewport.offsetTop` swings from 0 up to 370px via a run of
  // GENUINE `resize` events (not `scroll` — the pre-existing resize-only
  // filter does not help here) as the user scrolls the page with the
  // keyboard open. This is the confirmed mechanism behind the "keyboard
  // toolbar creeps/lifts away while scrolling" report.
  it('does not let a genuine resize event with an unchanged visualViewport.height corrupt the reported height (new-row-enter-6.log offsetTop swing)', () => {
    const provider = createVisualViewportVirtualKeyboardProvider();
    const callback = vi.fn();
    dispose = provider.onChange(callback);

    const sixLogResizeSequence: [
      windowInnerHeight: number,
      visualViewportHeight: number,
      visualViewportOffsetTop: number,
    ][] = [
      [812, 434.984375, 0], // settled baseline: height ~377.02
      [812, 435, 0],
      [812, 434.984375, 0],
      [812, 435, 0],
      [812, 434.984375, 187.328125], // offsetTop starts swinging...
      [812, 434.984375, 286.328125],
      [812, 435, 338],
      [812, 434.984375, 354.328125],
      [812, 435, 370], // ...almost back to a keyboard-height-sized offsetTop
      [812, 434.984375, 377.015625],
      [812, 435, 377],
    ];

    for (const [windowInnerHeight, height, offsetTop] of sixLogResizeSequence) {
      fireViewportEvent(
        viewport,
        'resize',
        { height, offsetTop },
        windowInnerHeight
      );
    }

    // Only the seed event produces a callback — every later event in this
    // real 370px offsetTop swing carries the same (within rounding noise)
    // visualViewport.height, so none of them are genuine keyboard-footprint
    // changes.
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenNthCalledWith(1, {
      visible: true,
      height: expect.closeTo(377.015625, 3),
    });
  });

  // Modeled on
  // affine-dev-MobileDebugLog_debug-top-to-bottom-jump-on-row-click-attempt-1.log
  // (round 2) — the same offsetTop-swing-via-resize mechanism as the test
  // above, but composited with a SIMULTANEOUS window.innerHeight dip
  // (492/547/577/...) of the kind fix 2b already guards against, exactly
  // as they co-occurred on-device. Proves the two guards compose
  // correctly: neither the windowInnerHeight dip nor the offsetTop swing
  // is allowed to move the reported height away from its last genuine
  // value while visualViewport.height itself never changes.
  it('does not let a genuine resize event with an unchanged visualViewport.height corrupt the reported height (top-to-bottom-jump.log offsetTop swing + windowInnerHeight dip)', () => {
    const provider = createVisualViewportVirtualKeyboardProvider();
    const callback = vi.fn();
    dispose = provider.onChange(callback);

    fireViewportEvent(viewport, 'resize', { height: 385, offsetTop: 0 }, 762);
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenLastCalledWith({ visible: true, height: 377 });

    const jumpLogResizeSequence: [
      windowInnerHeight: number,
      visualViewportHeight: number,
      visualViewportOffsetTop: number,
    ][] = [
      [762, 384.984375, 377.015625],
      [762, 385, 377],
      [762, 384.984375, 300.328125],
      [762, 385, 257.671875],
      [492, 384.984375, 325.328125],
      [547, 385, 269.65625],
      [577, 384.984375, 240.328125],
      [604, 385, 213],
      [630, 384.984375, 187.328125],
      [642, 385, 175],
      [753, 384.984375, 64.328125],
      [762, 385, 33],
      [762, 384.984375, 12.328125],
      [762, 385, 0],
      [762, 384.984375, 0],
      [762, 385, 0],
    ];

    for (const [
      windowInnerHeight,
      height,
      offsetTop,
    ] of jumpLogResizeSequence) {
      fireViewportEvent(
        viewport,
        'resize',
        { height, offsetTop },
        windowInnerHeight
      );
    }

    // None of these 16 further genuine resize events change
    // visualViewport.height by more than the epsilon, despite offsetTop
    // swinging up to 377px AND windowInnerHeight dipping to 492 along the
    // way — still exactly the one call from the seed above.
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('a correct resize event still updates visible/height as before (no regression)', () => {
    const provider = createVisualViewportVirtualKeyboardProvider();
    const callback = vi.fn();
    dispose = provider.onChange(callback);

    for (const height of [664, 700, 762]) {
      fireViewportEvent(viewport, 'resize', { height, offsetTop: 0 }, 762);
    }

    expect(callback).toHaveBeenCalledTimes(3);
    expect(callback).toHaveBeenNthCalledWith(1, { visible: true, height: 98 });
    expect(callback).toHaveBeenNthCalledWith(2, { visible: true, height: 62 });
    expect(callback).toHaveBeenNthCalledWith(3, { visible: false, height: 0 });
  });

  // Modeled on checkpoint #2 of .planning/debug/db-row-toolbar-scroll.md
  // (recorder v2 on a real iPhone, iOS 18.6.2 Safari, tapping a database row
  // title). With the keyboard still CLOSED, Safari's bottom bar collapsed
  // for a moment: window.innerHeight, and visualViewport.height with it,
  // jumped 628 -> 710 (= 100lvh) and decayed back to 628 over ~330ms as the
  // bar re-expanded. About 39s later the keyboard opened normally
  // (visualViewport.height 362.65625, offsetTop 0, innerHeight 628).
  // The 710 is a transient, not the layout height. The visual viewport
  // filled the layout viewport on every one of these samples (keyboard
  // closed), and the real keyboard height afterwards is
  // 628 - 362.65625 = 265.34375.
  // Rows are the recorded `resize` events only (the provider ignores
  // `scroll`). Full precision is recovered from the recorded panel heights
  // (35.671875 / 72.671875 / 80.671875px give the +-0.328125 offsetTop
  // jitter). The last 628 row is within the 1px gate of the 629 row before
  // it, so the last ACCEPTED transient sample is 629/629, as on-device.
  const dbRowBottomBarTransientSequence: [
    windowInnerHeight: number,
    visualViewportHeight: number,
    visualViewportOffsetTop: number,
  ][] = [
    [710, 710, 0],
    [706, 706, 0],
    [674, 674, 0.328125],
    [665, 665, 0],
    [657, 657, 0],
    [650, 650, 0],
    [645, 645, 0],
    [641, 641, 0],
    [637, 637, 0.328125],
    [635, 635, 0],
    [633, 633, 0],
    [632, 632, -0.328125],
    [631, 631, 0],
    [630, 630, 0],
    [629, 629, 0.328125],
    [628, 628, 0.328125],
  ];

  it('does not latch a transient window.innerHeight spike into the keyboard height (db-row-toolbar-scroll checkpoint #2: Safari bottom bar collapse 628 -> 710 -> 628 with the keyboard closed)', () => {
    const provider = createVisualViewportVirtualKeyboardProvider();
    const callback =
      vi.fn<(info: { visible: boolean; height: number }) => void>();
    dispose = provider.onChange(callback);

    // Settled, keyboard closed.
    fireViewportEvent(viewport, 'resize', { height: 628, offsetTop: 0 }, 628);
    expect(callback).toHaveBeenLastCalledWith({ visible: false, height: 0 });
    const callsBeforeTransient = callback.mock.calls.length;

    for (const [
      windowInnerHeight,
      height,
      offsetTop,
    ] of dbRowBottomBarTransientSequence) {
      fireViewportEvent(
        viewport,
        'resize',
        { height, offsetTop },
        windowInnerHeight
      );
    }
    const liftedWithKeyboardClosed = callback.mock.calls
      .slice(callsBeforeTransient)
      .map(([info]) => info)
      .filter(info => info.visible || info.height !== 0);
    const afterTransient = callback.mock.lastCall?.[0];

    // The keyboard opens.
    fireViewportEvent(
      viewport,
      'resize',
      { height: 620.65625, offsetTop: 0 },
      628
    );
    fireViewportEvent(
      viewport,
      'resize',
      { height: 362.65625, offsetTop: 0 },
      628
    );
    const afterKeyboardOpen = callback.mock.lastCall?.[0];

    // A single assertion, so a failure shows all three at once. With the
    // buggy latched 710 baseline: every transient sample after the 710 one
    // lifts the toolbar with no keyboard (up to 80.671875px), it stays
    // lifted at rest, and the open keyboard reads 347.34375 (82px too tall).
    expect({
      liftedWithKeyboardClosed,
      afterTransient,
      afterKeyboardOpen,
    }).toEqual({
      liftedWithKeyboardClosed: [],
      afterTransient: { visible: false, height: 0 },
      afterKeyboardOpen: {
        visible: true,
        height: expect.closeTo(265.34375, 3),
      },
    });
  });

  // Modeled on checkpoint #1 of .planning/debug/db-row-toolbar-scroll.md
  // (recorder v2, same iPhone, a paragraph with the keyboard OPEN the whole
  // time). During the keyboard-open document pans (drags B and C), iOS
  // reported window.innerHeight == visualViewport.height (229, 276, 310, 347)
  // while the layout height was still 628, but always with a LARGE
  // offsetTop (height + offsetTop ~= 628). The offsetTop clause is the only
  // thing that tells these rows apart from a closed keyboard, so they must
  // not re-seed the baseline. Rows are the recorded `resize` events
  // verbatim (the recorder rounds visualViewport fields to 0.1px).
  const paragraphKeyboardOpenPanSequence: [
    windowInnerHeight: number,
    visualViewportHeight: number,
    visualViewportOffsetTop: number,
  ][] = [
    [628, 362.7, 19.7], // within the 1px gate of 362.7, ignored
    [229, 229, 399],
    [276, 276, 352],
    [310, 310, 318],
    [347, 347, 281],
    [429, 362.7, 199.3],
  ];

  it('keeps reporting the keyboard as open during a keyboard-open document pan where innerHeight == visualViewport.height (db-row-toolbar-scroll checkpoint #1: the re-seed must not fire)', () => {
    const provider = createVisualViewportVirtualKeyboardProvider();
    const callback =
      vi.fn<(info: { visible: boolean; height: number }) => void>();
    dispose = provider.onChange(callback);

    fireViewportEvent(viewport, 'resize', { height: 628, offsetTop: 0 }, 628);
    fireViewportEvent(viewport, 'resize', { height: 620.7, offsetTop: 0 }, 628);
    fireViewportEvent(viewport, 'resize', { height: 362.7, offsetTop: 0 }, 628);
    expect(callback).toHaveBeenLastCalledWith({
      visible: true,
      height: expect.closeTo(265.3, 3),
    });
    const callsBeforePan = callback.mock.calls.length;

    for (const [
      windowInnerHeight,
      height,
      offsetTop,
    ] of paragraphKeyboardOpenPanSequence) {
      fireViewportEvent(
        viewport,
        'resize',
        { height, offsetTop },
        windowInnerHeight
      );
    }
    const duringPan = callback.mock.calls
      .slice(callsBeforePan)
      .map(([info]) => info);

    // 5 accepted samples (the first row is gated). Re-seeding on any of the
    // innerHeight == height rows would report the open keyboard as closed.
    // The heights during the pan are the round-2 gate / offsetTop issue
    // (cause 1 in the debug session) and are deliberately not asserted here.
    expect(duringPan).toHaveLength(5);
    expect(duringPan.filter(info => !info.visible)).toEqual([]);
  });

  // Known limitation of the re-seed (db-row-toolbar-scroll): the baseline is
  // only re-seeded while the keyboard is provably closed. A spike that
  // arrives while the keyboard is OPEN (hypothetical; checkpoint #2's spike
  // came with the keyboard closed) is still latched and shows up on the
  // next accepted resize. The next real keyboard close clears it.
  it('known limitation: a window.innerHeight spike while the keyboard is open stays latched until the next keyboard close, which clears it', () => {
    const provider = createVisualViewportVirtualKeyboardProvider();
    const callback =
      vi.fn<(info: { visible: boolean; height: number }) => void>();
    dispose = provider.onChange(callback);

    fireViewportEvent(viewport, 'resize', { height: 628, offsetTop: 0 }, 628);
    fireViewportEvent(
      viewport,
      'resize',
      { height: 362.65625, offsetTop: 0 },
      628
    );

    // The spike, with the keyboard open. visualViewport.height does not
    // move, so both rows are gated, but the running max still latches 710.
    fireViewportEvent(
      viewport,
      'resize',
      { height: 362.65625, offsetTop: 0 },
      710
    );
    fireViewportEvent(
      viewport,
      'resize',
      { height: 362.65625, offsetTop: 0 },
      628
    );

    // A later genuine keyboard-height change (cp2 also recorded vvH 317.7
    // with the keyboard open on this device).
    fireViewportEvent(
      viewport,
      'resize',
      { height: 317.65625, offsetTop: 0 },
      628
    );
    const afterKeyboardResize = callback.mock.lastCall?.[0];

    fireViewportEvent(viewport, 'resize', { height: 628, offsetTop: 0 }, 628);
    const afterClose = callback.mock.lastCall?.[0];

    fireViewportEvent(
      viewport,
      'resize',
      { height: 362.65625, offsetTop: 0 },
      628
    );
    const afterReopen = callback.mock.lastCall?.[0];

    expect({ afterKeyboardResize, afterClose, afterReopen }).toEqual({
      // Latched: 710 - 317.65625. The true value is 628 - 317.65625 = 310.34375.
      afterKeyboardResize: {
        visible: true,
        height: expect.closeTo(392.34375, 3),
      },
      afterClose: { visible: false, height: 0 },
      afterReopen: { visible: true, height: expect.closeTo(265.34375, 3) },
    });
  });

  it('plain keyboard open/close with no innerHeight spike is unchanged by the re-seed (control)', () => {
    const provider = createVisualViewportVirtualKeyboardProvider();
    const callback =
      vi.fn<(info: { visible: boolean; height: number }) => void>();
    dispose = provider.onChange(callback);

    for (const height of [
      628, 620.65625, 362.65625, 620.65625, 628, 362.65625,
    ]) {
      fireViewportEvent(viewport, 'resize', { height, offsetTop: 0 }, 628);
    }

    expect(callback.mock.calls.map(([info]) => info)).toEqual([
      { visible: false, height: 0 },
      { visible: true, height: expect.closeTo(7.34375, 3) },
      { visible: true, height: expect.closeTo(265.34375, 3) },
      { visible: true, height: expect.closeTo(7.34375, 3) },
      { visible: false, height: 0 },
      { visible: true, height: expect.closeTo(265.34375, 3) },
    ]);
  });
  describe('offset-only settle (db-row-toolbar-scroll bug 1)', () => {
    // Bug 1: iOS pans the visual viewport (offsetTop) without changing its
    // height -- focus-follow centring of a tapped row, Enter, or a document
    // drag. The round-2 gate ignores those events, so the reported height
    // (= keyboard top's distance from the layout bottom) went stale by
    // exactly the pan. Values below model the on-device recordings
    // (iOS 18.6 Safari, innerHeight 628, keyboard-open vv height 363).
    beforeEach(() => {
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it('re-places the toolbar once the viewport settles after iOS centres a tapped row (text -> row: was 94px too high)', () => {
      const provider = createVisualViewportVirtualKeyboardProvider();
      const callback = vi.fn();
      dispose = provider.onChange(callback);

      fireViewportEvent(viewport, 'resize', { height: 628, offsetTop: 0 }, 628);
      fireViewportEvent(
        viewport,
        'resize',
        { height: 363, offsetTop: 12 },
        628
      );
      expect(callback).toHaveBeenLastCalledWith({ visible: true, height: 253 });

      // focus-follow pan: offsetTop 12 -> 106 with height unchanged
      fireViewportEvent(viewport, 'scroll', { offsetTop: 60 }, 628);
      fireViewportEvent(viewport, 'scroll', { offsetTop: 106 }, 628);
      vi.advanceTimersByTime(200);

      expect(callback).toHaveBeenLastCalledWith({ visible: true, height: 159 });
    });

    it('re-places the toolbar after a document drag back down (paragraph run 1: was 199px behind the keyboard)', () => {
      const provider = createVisualViewportVirtualKeyboardProvider();
      const callback = vi.fn();
      dispose = provider.onChange(callback);

      fireViewportEvent(viewport, 'resize', { height: 628, offsetTop: 0 }, 628);
      fireViewportEvent(
        viewport,
        'resize',
        { height: 363, offsetTop: 199 },
        628
      );
      expect(callback).toHaveBeenLastCalledWith({ visible: true, height: 66 });

      // drag back: genuine resize events with an unchanged height, swinging
      // offsetTop (the round-2 gate swallows these by design)
      fireViewportEvent(
        viewport,
        'resize',
        { height: 363.2, offsetTop: 120 },
        628
      );
      fireViewportEvent(
        viewport,
        'resize',
        { height: 363, offsetTop: 0.5 },
        628
      );
      vi.advanceTimersByTime(200);

      expect(callback).toHaveBeenLastCalledWith({
        visible: true,
        height: expect.closeTo(264.5, 3),
      });
    });

    it('does not report anything mid-pan -- only after the viewport has been quiet (round-2 noise protection preserved)', () => {
      const provider = createVisualViewportVirtualKeyboardProvider();
      const callback = vi.fn();
      dispose = provider.onChange(callback);

      fireViewportEvent(viewport, 'resize', { height: 628, offsetTop: 0 }, 628);
      fireViewportEvent(viewport, 'resize', { height: 363, offsetTop: 0 }, 628);
      const callsAfterOpen = callback.mock.calls.length;

      for (let i = 1; i <= 10; i++) {
        fireViewportEvent(viewport, 'scroll', { offsetTop: i * 20 }, 628);
        vi.advanceTimersByTime(50);
      }
      expect(callback).toHaveBeenCalledTimes(callsAfterOpen);

      vi.advanceTimersByTime(200);
      expect(callback).toHaveBeenCalledTimes(callsAfterOpen + 1);
      expect(callback).toHaveBeenLastCalledWith({ visible: true, height: 65 });
    });

    it('does nothing while the keyboard is closed, and nothing when the settled value is unchanged', () => {
      const provider = createVisualViewportVirtualKeyboardProvider();
      const callback = vi.fn();
      dispose = provider.onChange(callback);

      fireViewportEvent(viewport, 'resize', { height: 628, offsetTop: 0 }, 628);
      const callsClosed = callback.mock.calls.length;
      fireViewportEvent(viewport, 'scroll', { offsetTop: 40 }, 628);
      vi.advanceTimersByTime(500);
      expect(callback).toHaveBeenCalledTimes(callsClosed);

      viewport.offsetTop = 0;
      fireViewportEvent(viewport, 'resize', { height: 363, offsetTop: 0 }, 628);
      const callsOpen = callback.mock.calls.length;
      fireViewportEvent(viewport, 'scroll', { offsetTop: 0.4 }, 628);
      vi.advanceTimersByTime(500);
      expect(callback).toHaveBeenCalledTimes(callsOpen);
    });

    it('cancels a pending settle on dispose', () => {
      const provider = createVisualViewportVirtualKeyboardProvider();
      const callback = vi.fn();
      const d = provider.onChange(callback);

      fireViewportEvent(viewport, 'resize', { height: 628, offsetTop: 0 }, 628);
      fireViewportEvent(viewport, 'resize', { height: 363, offsetTop: 0 }, 628);
      const calls = callback.mock.calls.length;
      fireViewportEvent(viewport, 'scroll', { offsetTop: 80 }, 628);
      d();
      vi.advanceTimersByTime(500);
      expect(callback).toHaveBeenCalledTimes(calls);
    });
  });
});
