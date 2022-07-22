[toc]

# Tutorial

1. MUI styled

```jsx
import type { MouseEventHandler, ReactNode } from 'react';
import { styled } from '@toeverything/components/ui';

const CardContainer = styled('div')({
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: '#fff',
    border: '1px solid #E2E7ED',
    borderRadius: '5px',
});

const CardContent = styled('div')({
    margin: '23px 52px 24px 19px',
});

const CardActions = styled('div')({
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    width: '100%',
    height: '29px',
    background: 'rgba(152, 172, 189, 0.1)',
    borderRadius: '0px 0px 5px 5px',
    padding: '6px 0 6px 19px',
    fontSize: '12px',
    fontWeight: '300',
    color: '#98ACBD',
});

const PlusIcon = styled('div')({
    marginRight: '9px',
    fontWeight: '500',
    lineHeight: 0,
    '::before': {
        content: '"+"',
    },
});

export const Card = ({
    children,
    onAddItem,
}: {
    children?: ReactNode,
    onAddItem?: MouseEventHandler<HTMLDivElement>,
}) => {
    return (
        <CardContainer>
            <CardContent>{children}</CardContent>
            <CardActions onClick={onAddItem}>
                <PlusIcon />
                Add item
            </CardActions>
        </CardContainer>
    );
};
```

## 2. import `*.scss`

```jsx
import styles from './tree-item.module.scss';

export const TreeItem = forwardRef<HTMLDivElement, TreeItemProps>(
    () => {

        return (
            <li
                ref={wrapperRef}
                className={cx(
                    styles['Wrapper'],
                    clone && styles['clone'],
                    ghost && styles['ghost'],
                    indicator && styles['indicator']
                )}
                style={
                    {
                        '--spacing': `${indentationWidth * depth}px`
                    } as CSSProperties
                }
                {...props}
            >

            </li>
        );
    }
);


```

## 3. import `*.css`,

```js
import 'codemirror/lib/codemirror.css';
import 'codemirror/lib/codemirror';
```
