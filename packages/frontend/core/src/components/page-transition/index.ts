import './page-transition.css';

type StartViewTransition = (callback: () => void | Promise<void>) => {
  finished: Promise<void>;
};

export function withPageFlipTransition(callback: () => void): void {
  const start = (
    typeof document !== 'undefined'
      ? (document as Document & { startViewTransition?: StartViewTransition })
          .startViewTransition
      : undefined
  )?.bind(document);

  if (!start) {
    callback();
    return;
  }

  const prefersReducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  if (prefersReducedMotion) {
    callback();
    return;
  }

  start(() => {
    callback();
  });
}
