import track from '@affine/track';

/**
 * Wrap the track function to add default properties to the first argument
 */
export const readwiseTrack = new Proxy(track.$.settingsPanel.integrationList, {
  get(target, key, receiver) {
    const original = Reflect.get(target, key, receiver);

    if (typeof original !== 'function') {
      return original;
    }

    return function (this: unknown, ...args: unknown[]) {
      if (args.length > 0 && typeof args[0] === 'object' && args[0] !== null) {
        args[0] = {
          type: 'readwise',
          control: 'Readwise Card',
          ...args[0],
        };
      }
      return original.apply(this, args);
    };
  },
});
