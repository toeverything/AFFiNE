import { LiveData, useLiveData } from '@toeverything/infra';
import {
  forwardRef,
  type Ref,
  useEffect,
  useImperativeHandle,
  useRef,
} from 'react';
import { createPortal } from 'react-dom';

export const createIsland = () => {
  const targetLiveData$ = new LiveData<HTMLDivElement | null>(null);
  let mounted = false;
  let provided = false;
  return {
    Target: forwardRef(function IslandTarget(
      { ...other }: React.HTMLProps<HTMLDivElement>,
      ref: Ref<HTMLDivElement>
    ) {
      const target = useRef<HTMLDivElement | null>(null);

      useImperativeHandle(ref, () => target.current as HTMLDivElement, []);
      useEffect(() => {
        if (mounted === true) {
          throw new Error('Island should not be mounted more than once');
        }
        mounted = true;
        targetLiveData$.next(target.current);
        return () => {
          mounted = false;
          targetLiveData$.next(null);
        };
      }, []);
      return <div {...other} ref={target}></div>;
    }),
    Provider: ({ children }: React.PropsWithChildren) => {
      const target = useLiveData(targetLiveData$);
      useEffect(() => {
        if (provided === true && process.env.NODE_ENV !== 'production') {
          throw new Error('Island should not be provided more than once');
        }
        provided = true;
        return () => {
          provided = false;
        };
      }, []);
      return target ? createPortal(children, target) : null;
    },
  };
};

export type Island = ReturnType<typeof createIsland>;
