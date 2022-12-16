import { Dispatch, SetStateAction, useEffect, useState } from 'react';

export type UseLocalStorage = <S>(
  key: string,
  initialState: S | (() => S),
  // If initialState is different from the initial local data, set it
  initialValue?: S
) => [S, Dispatch<SetStateAction<S>>];

export const useLocalStorage: UseLocalStorage = (
  key,
  defaultValue,
  initialValue
) => {
  const [item, setItem] = useState(defaultValue);

  useEffect(() => {
    const saved = localStorage.getItem(key);
    if (saved) {
      setItem(JSON.parse(saved));
    } else if (initialValue) {
      setItem(initialValue);
    }
  }, [initialValue, key, setItem]);

  useEffect(() => {
    localStorage.setItem(key, JSON.stringify(item));
  }, [item, key]);

  return [item, setItem];
};

export default useLocalStorage;
