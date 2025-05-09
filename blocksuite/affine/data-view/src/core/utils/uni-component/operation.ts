import type { UniComponent } from '@blocksuite/affine-shared/types';

export const uniMap = <T, R, P extends NonNullable<unknown>>(
  component: UniComponent<T, P>,
  map: (r: R) => T
): UniComponent<R, P> => {
  return (ele, props, expose) => {
    const result = component(ele, map(props), expose);
    return {
      unmount: result.unmount,
      update: props => {
        result.update(map(props));
      },
    };
  };
};
