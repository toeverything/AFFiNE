import { type ComponentType, useRef } from 'react';
import * as uiIcons from '@toeverything/components/icons';
import { message, styled } from '@toeverything/components/ui';
import { copy } from './copy';

const IconBooth = ({
    name,
    Icon,
}: {
    name: string;
    Icon: ComponentType<any>;
}) => {
    const on_click = () => {
        copy(`<${name} />`);
        message.success('Copied ~');
    };
    return (
        <IconContainer title={name} onClick={on_click}>
            <Icon />
            <IconName>{name}</IconName>
        </IconContainer>
    );
};

const _icons = Object.entries(uiIcons).filter(([key]) => key !== 'timestamp');

export const Icons = () => {
    const ref = useRef<HTMLHeadingElement>(null);
    return (
        <Container>
            <h3 ref={ref}>Example:</h3>
            <div>
                <code>
                    {`import { TextIcon } from '@toeverything/components/ui'`};
                </code>
            </div>
            <h3>{`Total: ${_icons.length}`}</h3>
            <blockquote>Click to copy.</blockquote>
            <p>{`Last Updated: ${new Date(
                uiIcons.timestamp
            ).toLocaleString()}`}</p>
            <hr />
            <IconsContainer>
                {_icons.map(([key, icon]) => {
                    return (
                        <IconBooth
                            key={key}
                            name={key}
                            Icon={icon as ComponentType<any>}
                        />
                    );
                })}
            </IconsContainer>
        </Container>
    );
};

const Container = styled('div')({
    height: '100vh',
    overflow: 'auto',
    color: '#98ACBD',
    padding: '20px',
});

const IconName = styled('div')({
    width: '100%',
    marginTop: '8px',
    wordBreak: 'break-all',
});

const IconContainer = styled('div')(({ theme }) => ({
    width: '112px',
    borderRadius: '4px',
    padding: '4px',
    cursor: 'pointer',
    textAlign: 'center',
    '--color-0': theme.affine.palette.hover,
    '--color-1': theme.affine.palette.icons,

    '& svg:first-of-type': {
        boxShadow: '0 0 6px #e0e6eb',
    },

    '&:hover': {
        backgroundColor: '#F5F7F8',
    },
}));

const IconsContainer = styled('div')({
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill,112px)',
    justifyContent: 'justify',
    alignContent: 'start',
    columnGap: '16px',
    rowGap: '24px',
    marginTop: '24px',
});
