import { useAFFiNEI18N } from '@affine/i18n/hooks';
import clsx from 'clsx';
import {
  type ChangeEvent,
  type ClipboardEvent,
  type CSSProperties,
  type FC,
  useCallback,
  useEffect,
  useState,
} from 'react';

import {
  authCodeContainer,
  authCodeErrorMessage,
  authCodeWrapper,
  authInput,
} from './share.css';

export type AuthCodeProps = {
  codeNumber?: number;
  style?: CSSProperties;
  onComplete?: (code: string) => void;
  error?: boolean;
};

export const AuthCode: FC<AuthCodeProps> = ({
  codeNumber = 6,
  error,
  style,
  onComplete,
}) => {
  const t = useAFFiNEI18N();
  const [inputs, setInputs] = useState<HTMLInputElement[]>([]);
  const [codes, setCodes] = useState<string[]>([]);

  useEffect(() => {
    if (codes.length === codeNumber) {
      onComplete?.(codes.join(''));
    }
  }, [codeNumber, codes, onComplete]);

  const pasteHandler = useCallback(
    (event: ClipboardEvent<HTMLInputElement>, index: number) => {
      const pastedStr = event.clipboardData?.getData('text/plain');
      if (!pastedStr) {
        event.preventDefault();
        return;
      }
      for (let i = index, j = 0; i < codeNumber; i++, j++) {
        codes[i] = pastedStr[j] || '';
      }
      setCodes([...codes]);
    },
    [codeNumber, codes]
  );

  const changeHandler = useCallback(
    (e: ChangeEvent<HTMLInputElement>, index: number) => {
      const value = e.target.value || '';

      codes[index] = value;
      setCodes([...codes]);
      if (value.length === 1 && index < codeNumber - 1) {
        inputs[index + 1]?.focus();
        return;
      }
    },
    [codeNumber, codes, inputs]
  );

  return (
    <div className={authCodeContainer}>
      <div
        className={clsx(authCodeWrapper, {
          error,
        })}
        style={style}
      >
        {new Array(codeNumber).fill(0).map((_, index) => {
          return (
            <input
              ref={ref => {
                inputs[index] = ref as HTMLInputElement;
                setInputs(inputs);
              }}
              value={codes[index] || ''}
              key={index}
              className={clsx(authInput, { error })}
              maxLength={1}
              onChange={e => {
                changeHandler(e, index);
              }}
              onPaste={e => {
                pasteHandler(e, index);
              }}
            />
          );
        })}
      </div>
      <div className={authCodeErrorMessage}>
        {error ? t['com.affine.auth.sign.auth.code.error.hint']() : ''}
      </div>
    </div>
  );
};
