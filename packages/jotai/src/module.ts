import type { Atom, createStore, PrimitiveAtom, WritableAtom } from 'jotai';
import { atom } from 'jotai';

import { resourceContextAtom } from './resource';

type Getter = <Value>(atom: Atom<Value>) => Value;
type Setter = <Value, Args extends unknown[], Result>(
  atom: WritableAtom<Value, Args, Result>,
  ...args: Args
) => Result;
type SetAtom<Args extends unknown[], Result> = <A extends Args>(
  ...args: A
) => Result;
type Read<Value, SetSelf = never> = (
  get: Getter,
  options: {
    readonly signal: AbortSignal;
    readonly setSelf: SetSelf;
  }
) => Value;
type Write<Args extends unknown[], Result> = (
  get: Getter,
  set: Setter,
  ...args: Args
) => Result;
type WithInitialValue<Value> = {
  init: Value;
};
type OnUnmount = () => void;
type OnMount<Args extends unknown[], Result> = <
  S extends SetAtom<Args, Result>
>(
  setAtom: S
) => OnUnmount | void;

const kTag = Symbol('tag');
const vIsPrimitiveAtom = Symbol('isPrimitiveAtom');
const vIsEffectAtom = Symbol('isEffectAtom');
const vIsDispatchAtom = Symbol('isDispatchAtom');

type WithAffine<Atom extends object> = Atom & {
  [kTag]: symbol;
};

export type AffinePrimitiveAtom<Value> = WithAffine<
  PrimitiveAtom<Value> & WithInitialValue<Value>
>;
export type AffineEffectAtom<Result = unknown> = WithAffine<
  Atom<Promise<Result>>
>;
export type AffineDispatchAtom<Args extends unknown[], Result> = WithAffine<
  WritableAtom<null, Args, Result>
>;

export function primitiveAtom<Value>(
  initialValue: Value
): AffinePrimitiveAtom<Value> {
  const config = atom(initialValue);
  Object.defineProperty(config, kTag, {
    value: vIsPrimitiveAtom,
    writable: false,
  });
  return config as any;
}

export function effectAtom<Result = unknown>(
  read: Read<Promise<Result>>
): AffineEffectAtom<Result> {
  const config = atom<Promise<Result>>(read);
  Object.defineProperty(config, kTag, {
    value: vIsEffectAtom,
    writable: false,
  });
  return config as any;
}

export function dispatchAtom<Args extends unknown[], Result>(
  write: Write<Args, Result>
): AffineDispatchAtom<Args, Result> {
  const config = atom<null, Args, Result>(null, write);
  Object.defineProperty(config, kTag, {
    value: vIsDispatchAtom,
  });
  return config as any;
}

interface Context {
  store: ReturnType<typeof createStore>;
  atoms: {
    resourceContextAtom: typeof resourceContextAtom;
  };
}

type AffineAtom =
  | WithAffine<Atom<unknown>>
  | WithAffine<PrimitiveAtom<unknown>>
  | WithAffine<WritableAtom<never, unknown[], unknown>>;

export function createModule(
  name: string,
  createModule: (context: Context) => AffineAtom[]
) {
  return function init(store: ReturnType<typeof createStore>) {
    const atoms = createModule({
      store,
      atoms: {
        resourceContextAtom,
      },
    });
    const effects = atoms.filter(atom => atom[kTag] === vIsEffectAtom);
    const dispatches = atoms.filter(atom => atom[kTag] === vIsDispatchAtom);
    const primitives = atoms.filter(atom => atom[kTag] === vIsPrimitiveAtom);
    return {
      name,
      effects,
      dispatches,
      primitives,
    } as {
      name: string;
      effects: AffineEffectAtom[];
      dispatches: AffineDispatchAtom<unknown[], unknown>[];
      primitives: AffinePrimitiveAtom<unknown>[];
    };
  };
}

export function assertEffectAtom(
  atom: AffineAtom
): asserts atom is WithAffine<Atom<Promise<unknown>>> {
  if (atom[kTag] !== vIsEffectAtom) {
    throw new Error('Not an effect atom');
  }
}

export function assertPrimitiveAtom(
  atom: AffineAtom
): asserts atom is WithAffine<PrimitiveAtom<unknown>> {
  if (atom[kTag] !== vIsPrimitiveAtom) {
    throw new Error('Not a primitive atom');
  }
}

export function assertDispatchAtom(
  atom: AffineAtom
): asserts atom is WithAffine<WritableAtom<never, unknown[], unknown>> {
  if (atom[kTag] !== vIsDispatchAtom) {
    throw new Error('Not a dispatch atom');
  }
}
