import { useMemo } from 'react';
import { createEditor } from 'slate';
import { Slate, Editable as SlateEditable, withReact } from 'slate-react';
import { ErrorBoundary } from '@toeverything/utils';
// import { EditableText, EditableElement } from './types';

// interface EditableProps {
//     value: EditableText[];
//     onChange: () => void;
// }

export const Editable = () => {
    const editor = useMemo(() => withReact(createEditor()), []);
    return (
        <ErrorBoundary
            FallbackComponent={props => (
                <div>Render Error. {props.error?.message}</div>
            )}
        >
            <Slate editor={editor} value={[]} onChange={() => 1}>
                <SlateEditable />
            </Slate>
        </ErrorBoundary>
    );
};
