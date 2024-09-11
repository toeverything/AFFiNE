import { NEVER } from 'rxjs';

import { Entity } from '../../../framework';
import { LiveData } from '../../../livedata';
import type { GlobalStateService } from '../../storage';
import { AFFINE_FLAGS } from '../constant';
import type { FlagInfo } from '../types';

const FLAG_PREFIX = 'affine-flag:';

export type Flag<F extends FlagInfo = FlagInfo> = {
  readonly value: F['defaultState'] extends boolean
    ? boolean
    : boolean | undefined;
  set: (value: boolean) => void;
  // eslint-disable-next-line rxjs/finnish
  $: F['defaultState'] extends boolean
    ? LiveData<boolean>
    : LiveData<boolean> | LiveData<boolean | undefined>;
} & F;

export class Flags extends Entity {
  private readonly globalState = this.globalStateService.globalState;

  constructor(private readonly globalStateService: GlobalStateService) {
    super();

    Object.entries(AFFINE_FLAGS).forEach(([flagKey, flag]) => {
      const configurable = flag.configurable ?? true;
      const defaultState =
        'defaultState' in flag ? flag.defaultState : undefined;
      const getValue = () => {
        return configurable
          ? (this.globalState.get<boolean>(FLAG_PREFIX + flagKey) ??
              defaultState)
          : defaultState;
      };
      const item = {
        ...flag,
        get value() {
          return getValue();
        },
        set: (value: boolean) => {
          if (!configurable) {
            return;
          }
          this.globalState.set(FLAG_PREFIX + flagKey, value);
        },
        $: configurable
          ? LiveData.from<boolean | undefined>(
              this.globalState.watch<boolean>(FLAG_PREFIX + flagKey),
              undefined
            ).map(value => value ?? defaultState)
          : LiveData.from(NEVER, defaultState),
      } as Flag<typeof flag>;
      Object.defineProperty(this, flagKey, {
        get: () => {
          return item;
        },
      });
    });
  }
}

export type FlagsExt = Flags & {
  [K in keyof AFFINE_FLAGS]: Flag<AFFINE_FLAGS[K]>;
};
