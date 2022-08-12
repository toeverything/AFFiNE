import { SyntheticEvent } from 'react';

export const stopPropagation = (
    e: KeyboardEvent | SyntheticEvent<any, Event>
) => e.stopPropagation();
