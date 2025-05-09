import { useEffect, useState } from 'react';

export function useDisposable<T extends Disposable | AsyncDisposable>(
  disposableFn: (abortSignal?: AbortSignal) => Promise<T | null>,
  deps?: any[]
): { data: T | null; loading: boolean; error: Error | null };

export function useDisposable<T extends Disposable | AsyncDisposable>(
  disposableFn: (abortSignal?: AbortSignal) => T | null,
  deps?: any[]
): { data: T | null };

export function useDisposable<T extends Disposable | AsyncDisposable>(
  disposableFn: (abortSignal?: AbortSignal) => Promise<T | null> | T | null,
  deps?: any[]
) {
  const [state, setState] = useState<{
    data: T | null;
    loading: boolean;
    error: Error | null;
  }>({
    data: null,
    loading: false,
    error: null,
  });

  useEffect(() => {
    const abortController = new AbortController();
    let _data: T | null = null;
    setState(prev => ({ ...prev, loading: true, error: null }));

    Promise.resolve(disposableFn(abortController.signal))
      .then(data => {
        _data = data;
        if (!abortController.signal.aborted) {
          setState({ data, loading: false, error: null });
        }
      })
      .catch(error => {
        if (!abortController.signal.aborted) {
          setState(prev => ({ ...prev, error, loading: false }));
        }
      });

    return () => {
      abortController.abort();

      if (_data && typeof _data === 'object') {
        if (Symbol.dispose in _data) {
          _data[Symbol.dispose]();
        } else if (Symbol.asyncDispose in _data) {
          _data[Symbol.asyncDispose]();
        }
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps || []);

  return state;
}
