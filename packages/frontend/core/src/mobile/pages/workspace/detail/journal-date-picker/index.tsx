import {
  type HTMLAttributes,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

import { JournalDatePickerContext } from './context';
import { ResizeViewport } from './viewport';

export interface JournalDatePickerProps extends Omit<
  HTMLAttributes<HTMLDivElement>,
  'onChange'
> {
  date: string;
  onChange: (date: string) => void;
  withDotDates: Set<string | null | undefined>;
}
export const JournalDatePicker = ({
  date: selected,
  onChange,
  withDotDates,
  ...attrs
}: JournalDatePickerProps) => {
  const [cursor, setCursor] = useState(selected);

  // should update cursor when selected modified outside
  useEffect(() => {
    setCursor(selected);
  }, [selected]);

  const onSelect = useCallback(
    (date: string) => {
      setCursor(date);
      onChange(date);
    },
    [onChange]
  );
  const width = window.innerWidth;
  const journalDatePickerContextValue = useMemo(
    () => ({
      selected,
      onSelect,
      cursor,
      setCursor,
      width,
      withDotDates,
    }),
    [cursor, onSelect, selected, width, withDotDates]
  );

  return (
    <JournalDatePickerContext.Provider value={journalDatePickerContextValue}>
      <ResizeViewport {...attrs} />
    </JournalDatePickerContext.Provider>
  );
};
