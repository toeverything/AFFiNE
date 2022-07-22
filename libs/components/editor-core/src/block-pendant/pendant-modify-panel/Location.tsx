import React, { useState } from 'react';

import { Input } from '@toeverything/components/ui';
import { ModifyPanelContentProps } from './types';

export default ({ onValueChange, initialValue }: ModifyPanelContentProps) => {
    const [text, setText] = useState(initialValue?.value || '');
    return (
        <Input
            placeholder="Input location"
            value={text}
            onChange={e => {
                setText(e.target.value);
                onValueChange(e.target.value);
            }}
        />
    );
};
