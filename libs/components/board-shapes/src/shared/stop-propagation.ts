import type React from 'react';

export const stopPropagation = (
    e: KeyboardEvent | React.SyntheticEvent<any, Event>
) => e.stopPropagation();
