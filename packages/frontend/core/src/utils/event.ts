import type { BaseSyntheticEvent } from 'react';

export function stopPropagation(event: BaseSyntheticEvent) {
  event.stopPropagation();
}

export function preventDefault(event: BaseSyntheticEvent) {
  event.preventDefault();
}

export function stopEvent(event: BaseSyntheticEvent) {
  event.stopPropagation();
  event.preventDefault();
}

export function isNewTabTrigger(event?: React.MouseEvent | MouseEvent) {
  return event ? event.ctrlKey || event.metaKey || event.button === 1 : false;
}
