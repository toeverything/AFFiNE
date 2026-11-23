import { I18nService } from '@affine/core/modules/i18n';
import { DirectionProvider as RadixDirectionProvider } from '@radix-ui/react-direction';
import { useLiveData, useService } from '@toeverything/infra';
import type { PropsWithChildren } from 'react';

/**
 * Provides the current text direction to all Radix UI primitives.
 *
 * Radix components read direction from React context, not from the
 * document `dir` attribute, so without this provider every dropdown,
 * popover and menu renders LTR even when an RTL language is active.
 */
export const DirectionProvider = ({ children }: PropsWithChildren) => {
  const i18n = useService(I18nService).i18n;
  const language = useLiveData(i18n.currentLanguage$);

  return (
    <RadixDirectionProvider dir={language?.rtl ? 'rtl' : 'ltr'}>
      {children}
    </RadixDirectionProvider>
  );
};
