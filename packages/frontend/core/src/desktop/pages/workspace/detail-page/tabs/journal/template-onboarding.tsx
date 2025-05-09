import { Button, IconButton, Menu } from '@affine/component';
import { GlobalStateService } from '@affine/core/modules/storage';
import { TemplateDocService } from '@affine/core/modules/template-doc';
import { TemplateListMenuContentScrollable } from '@affine/core/modules/template-doc/view/template-list-menu';
import { useI18n } from '@affine/i18n';
import { CloseIcon, TemplateIcon } from '@blocksuite/icons/rc';
import { LiveData, useLiveData, useService } from '@toeverything/infra';
import { useTheme } from 'next-themes';
import { memo, useCallback, useEffect, useMemo, useRef } from 'react';

import { journalPaperDark, journalPaperLight } from './assets';
import * as styles from './template-onboarding.css';

const dismissedKey = 'journal-template-onboarding-dismissed';
// to make sure the animation won't re-play until page is reloaded
let animationPlayed = false;

export const JournalTemplateOnboarding = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const globalState = useService(GlobalStateService).globalState;
  const templateDocService = useService(TemplateDocService);
  const t = useI18n();

  const dismissed = useLiveData(
    useMemo(
      () => LiveData.from(globalState.watch(dismissedKey), false),
      [globalState]
    )
  );

  const onDismiss = useCallback(() => {
    const container = containerRef.current;
    if (!container) {
      globalState.set(dismissedKey, true);
      return;
    }

    const animation = container.animate(
      [
        {},
        {
          height: 0,
          paddingTop: 0,
          paddingBottom: 0,
          marginBottom: 0,
          opacity: 0,
        },
      ],
      { duration: 280, easing: 'cubic-bezier(.35,.58,.01,1)', fill: 'forwards' }
    );
    animation.onfinish = () => {
      globalState.set(dismissedKey, true);
    };
  }, [globalState]);

  const updateJournalTemplate = useCallback(
    (templateId: string) => {
      templateDocService.setting.updateJournalTemplateDocId(templateId);
    },
    [templateDocService.setting]
  );

  if (dismissed) return null;

  return (
    <div
      className={styles.container}
      data-animation-played={animationPlayed}
      ref={containerRef}
    >
      <div className={styles.card} data-animation-played={animationPlayed}>
        <p className={styles.title}>
          {t['com.affine.template-journal-onboarding.title']()}
        </p>
        <Menu
          contentOptions={{ className: styles.menu, align: 'end' }}
          items={
            <TemplateListMenuContentScrollable
              onSelect={updateJournalTemplate}
            />
          }
        >
          <Button variant="primary" prefix={<TemplateIcon />}>
            {t['com.affine.template-journal-onboarding.select']()}
          </Button>
        </Menu>
        <JournalPaper />
        <IconButton
          size="16"
          className={styles.close}
          icon={<CloseIcon />}
          onClick={onDismiss}
        />
      </div>
    </div>
  );
};

const JournalPaper = memo(function JournalPaper() {
  const ref = useRef<HTMLDivElement>(null);
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    const paper = ref.current;
    if (!paper) return;
    const onAnimationEnd = () => (animationPlayed = true);
    paper.addEventListener('animationend', onAnimationEnd, { once: true });
    return () => {
      paper.removeEventListener('animationend', onAnimationEnd);
    };
  }, []);

  return (
    <div
      ref={ref}
      className={styles.paper}
      data-animation-played={animationPlayed}
      dangerouslySetInnerHTML={{
        __html: resolvedTheme === 'dark' ? journalPaperDark : journalPaperLight,
      }}
    />
  );
});
