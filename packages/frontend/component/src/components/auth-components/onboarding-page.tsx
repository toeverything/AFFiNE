import { apis } from '@affine/electron-api';
import { fetchWithTraceReport } from '@affine/graphql';
import { ArrowRightSmallIcon } from '@blocksuite/icons';
import clsx from 'clsx';
import { useEffect, useMemo, useState } from 'react';
// eslint-disable-next-line @typescript-eslint/no-restricted-imports
import { type Location, useLocation, useNavigate } from 'react-router-dom';
import useSWR from 'swr';

import { Button } from '../../ui/button';
import { Checkbox } from '../../ui/checkbox';
import { Divider } from '../../ui/divider';
import Input from '../../ui/input';
import { ScrollableContainer } from '../../ui/scrollbar';
import * as styles from './onboarding-page.css';
import type { User } from './type';

type QuestionOption = {
  type: 'checkbox' | 'input';
  label: string;
  value: string;
};

type Question = {
  id?: string;
  question: string;
  options?: QuestionOption[];
};

type QuestionnaireAnswer = {
  form: string;
  ask: string;
  answer: string[];
};

function getCallbackUrl(location: Location) {
  try {
    const url =
      location.state?.callbackURL ||
      new URLSearchParams(location.search).get('redirect_uri');
    if (typeof url === 'string' && url) {
      if (!url.startsWith('http:') && !url.startsWith('https:')) {
        return url;
      }
      // we will ignore host to avoid redirect hack
      const parsedUrl = new URL(url);
      return parsedUrl.pathname + parsedUrl.search;
    }
  } catch (_) {}
  return null;
}

export const ScrollableLayout = ({
  headerItems,
  children,
  isMacosDesktop,
  isWindowsDesktop,
}: {
  isMacosDesktop?: boolean;
  isWindowsDesktop?: boolean;
  headerItems?: React.ReactNode;
  children: React.ReactNode;
}) => {
  return (
    <div className={styles.layout} data-is-macos-electron={isMacosDesktop}>
      <header
        className={styles.header}
        data-is-windows-electron={isWindowsDesktop}
      >
        {headerItems}
      </header>
      <ScrollableContainer className={styles.scrollableContainer}>
        <div className={styles.onboardingContainer}>{children}</div>
      </ScrollableContainer>
      <footer className={styles.footer}>
        <div className={styles.linkGroup}>
          <a
            className={styles.link}
            href="https://affine.pro/terms"
            target="_blank"
            rel="noreferrer"
          >
            Terms of Conditions
          </a>
          <Divider orientation="vertical" />
          <a
            className={styles.link}
            href="https://affine.pro/privacy"
            target="_blank"
            rel="noreferrer"
          >
            Privacy Policy
          </a>
        </div>
      </footer>
    </div>
  );
};

export const OnboardingPage = ({
  user,
  onOpenAffine,
  windowControl,
}: {
  user: User;
  onOpenAffine: () => void;
  windowControl?: React.ReactNode;
}) => {
  const location = useLocation();
  const navigate = useNavigate();
  const [questionIdx, setQuestionIdx] = useState(0);
  const { data: questions } = useSWR<Question[]>(
    '/api/worker/questionnaire',
    url => fetchWithTraceReport(url).then(r => r.json()),
    { suspense: true, revalidateOnFocus: false }
  );
  const [options, setOptions] = useState(new Set<string>());
  const [inputs, setInputs] = useState<Record<string, string>>({});

  const callbackUrl = useMemo(() => getCallbackUrl(location), [location]);
  const question = useMemo(
    () => questions?.[questionIdx],
    [questionIdx, questions]
  );
  const isMacosDesktop = environment.isDesktop && environment.isMacOs;
  const isWindowsDesktop = environment.isDesktop && environment.isWindows;

  useEffect(() => {
    if (environment.isDesktop) {
      // to hide macOS window control buttons
      apis?.ui.handleSidebarVisibilityChange(false).catch(err => {
        console.error(err);
      });
    }
  }, []);

  if (!questions) {
    return null;
  }

  if (callbackUrl?.startsWith('/open-app/signin-redirect')) {
    const url = new URL(callbackUrl, window.location.origin);
    url.searchParams.set('next', 'onboarding');
    console.log('redirect to', url.toString());
    window.location.assign(url.toString());
    return null;
  }

  if (question) {
    return (
      <ScrollableLayout
        headerItems={
          <>
            {isWindowsDesktop ? windowControl : null}
            <Button
              className={clsx(styles.button, {
                [styles.disableButton]: questionIdx === 0,
                [styles.windowsAppButton]: isWindowsDesktop,
              })}
              size="extraLarge"
              onClick={() => setQuestionIdx(questions.length)}
            >
              Skip
            </Button>
          </>
        }
        isMacosDesktop={isMacosDesktop}
        isWindowsDesktop={isWindowsDesktop}
      >
        <div className={styles.content}>
          <h1 className={styles.question}>{question.question}</h1>
          <div className={styles.optionsWrapper}>
            {question.options &&
              question.options.length > 0 &&
              question.options.map((option, optionIndex) => {
                if (option.type === 'checkbox') {
                  return (
                    <Checkbox
                      key={optionIndex}
                      name={option.value}
                      className={styles.checkBox}
                      labelClassName={styles.label}
                      checked={options.has(option.value)}
                      onChange={e => {
                        setOptions(set => {
                          if (e.target.checked) {
                            set.add(option.value);
                          } else {
                            set.delete(option.value);
                          }
                          return new Set(set);
                        });
                      }}
                      label={option.label}
                    />
                  );
                } else if (option.type === 'input') {
                  return (
                    <Input
                      key={optionIndex}
                      className={styles.input}
                      type="text"
                      size="large"
                      placeholder={option.label}
                      value={inputs[option.value] || ''}
                      onChange={value =>
                        setInputs(prev => ({ ...prev, [option.value]: value }))
                      }
                    />
                  );
                }
                return null;
              })}
          </div>
          <div className={styles.buttonWrapper}>
            <Button
              className={clsx(styles.button, {
                [styles.disableButton]: questionIdx !== 0,
              })}
              size="extraLarge"
              onClick={() => setQuestionIdx(questions.length)}
            >
              Skip
            </Button>
            <Button
              className={styles.button}
              type="primary"
              size="extraLarge"
              itemType="submit"
              onClick={() => {
                if (question.id && user?.id) {
                  const answer: QuestionnaireAnswer = {
                    form: user.id,
                    ask: question.id,
                    answer: [
                      ...Array.from(options),
                      ...Object.entries(inputs).map(
                        ([key, value]) => `${key}:${value}`
                      ),
                    ],
                  };

                  // eslint-disable-next-line @typescript-eslint/no-floating-promises
                  fetchWithTraceReport('/api/worker/questionnaire', {
                    method: 'POST',
                    body: JSON.stringify(answer),
                  }).finally(() => {
                    setOptions(new Set());
                    setInputs({});
                    setQuestionIdx(questionIdx + 1);
                  });
                } else {
                  setQuestionIdx(questionIdx + 1);
                }
              }}
              iconPosition="end"
              icon={<ArrowRightSmallIcon />}
            >
              {questionIdx === 0 ? 'start' : 'Next'}
            </Button>
          </div>
        </div>
      </ScrollableLayout>
    );
  }
  return (
    <ScrollableLayout
      headerItems={isWindowsDesktop ? windowControl : null}
      isMacosDesktop={isMacosDesktop}
      isWindowsDesktop={isWindowsDesktop}
    >
      <div className={styles.thankContainer}>
        <h1 className={styles.thankTitle}>Thank you!</h1>
        <p className={styles.thankText}>
          We will continue to enhance our products based on your feedback. Thank
          you once again for your supports.
        </p>
        <Button
          className={clsx(styles.button, styles.openAFFiNEButton)}
          type="primary"
          size="extraLarge"
          onClick={() => {
            if (callbackUrl) {
              navigate(callbackUrl);
            } else {
              onOpenAffine();
            }
          }}
          iconPosition="end"
          icon={<ArrowRightSmallIcon />}
        >
          Get Started
        </Button>
      </div>
    </ScrollableLayout>
  );
};
