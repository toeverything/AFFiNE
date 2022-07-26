import React, { CSSProperties, useState } from 'react';

import { ModifyPanelContentProps } from './types';
import { HighLightIconInput } from './IconInput';

export default ({
    onValueChange,
    initialValue,
    iconConfig,
}: ModifyPanelContentProps) => {
    const [text, setText] = useState(initialValue?.value || '');
    return (
        <HighLightIconInput
            iconName={iconConfig?.iconName}
            color={iconConfig?.color as CSSProperties['color']}
            background={iconConfig?.background as CSSProperties['background']}
            value={text}
            placeholder="Input text"
            onChange={e => {
                setText(e.target.value);
                onValueChange(e.target.value);
            }}
        />
    );
};
