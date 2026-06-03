import { type BlockStdScope, type UIEventHandler } from '@blocksuite/std';

import { textFormatConfigs } from '../command/index.js';

export const textFormatKeymap = (std: BlockStdScope) =>
  textFormatConfigs
    .filter(config => config.hotkey)
    .reduce(
      (acc, config) => {
        return {
          ...acc,
          [config.hotkey as string]: ctx => {
            const { store: doc } = std;
            if (doc.readonly) return;

            const allowed = config.textChecker?.(std.host) ?? true;
            if (!allowed) return;

            const event = ctx.get('keyboardState').raw;
            event.stopPropagation();
            event.preventDefault();

            config.action(std.host);
            return true;
          },
        };
      },
      {} as Record<string, UIEventHandler>
    );
