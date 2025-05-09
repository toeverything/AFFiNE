import type {
  ExposeWrapper,
  UniComponent,
  UniComponentReturn,
} from '@blocksuite/affine-shared/types';
import { nanoid } from 'nanoid';
import {
  type ComponentType,
  memo,
  type ReactNode,
  useEffect,
  useState,
} from 'react';
import { createPortal } from 'react-dom';

const UniReactNode = memo(
  function UniReactNode(props: {
    ele: HTMLElement;
    component: ComponentType<any>;
    dataRef: DataRef<any>;
    expose: ExposeWrapper<any>;
  }) {
    const Component = props.component;
    const [data, setData] = useState(props.dataRef.value);
    useEffect(() => {
      return props.dataRef.subscribe(() => {
        setData(props.dataRef.value);
      });
    }, [props.dataRef]);
    return createPortal(<Component ref={props.expose} {...data} />, props.ele);
  },
  () => true
);
type DataRef<T> = {
  value: T;
  subscribe: (update: () => void) => void;
  update: (props: T) => void;
};
const createDataRef = <T,>(data: T): DataRef<T> => {
  let listener = () => {};
  const ref = {
    value: data,
    subscribe: (update: () => void) => {
      listener = update;
      return () => {
        listener = () => {};
      };
    },
    update: (props: T) => {
      ref.value = props;
      listener();
    },
  };
  return ref;
};
export const createUniReactRoot = () => {
  const nodes: Set<ReactNode> = new Set();
  let updateNodes = () => {};
  return {
    Root: () => {
      const [, forceUpdate] = useState({});
      useEffect(() => {
        updateNodes = () => forceUpdate({});
      }, []);
      return nodes;
    },
    createUniComponent: <T, E extends NonNullable<unknown>>(
      component: ComponentType<T>
    ): UniComponent<T, E> => {
      return (ele: HTMLElement, props: T, expose) => {
        const dataRef = createDataRef(props);
        const node = (
          <UniReactNode
            key={nanoid()}
            expose={expose}
            ele={ele}
            component={component}
            dataRef={dataRef}
          />
        );
        nodes.add(node);
        updateNodes();
        return {
          update: (props: T) => {
            dataRef.update(props);
          },
          unmount: () => {
            nodes.delete(node);
            updateNodes();
          },
        } satisfies UniComponentReturn<T>;
      };
    },
  };
};
export const uniReactRoot = createUniReactRoot();
