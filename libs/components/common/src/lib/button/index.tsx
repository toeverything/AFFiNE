import clsx from 'clsx';
import style9 from 'style9';

const styles = style9.create({
    ligoButton: {
        border: 'none',
        outline: 'none',
        // backgroundColor: 'white',
        cursor: 'pointer',
        ':hover': {
            backgroundColor: '#edeef0',
        },
    },
});

export type ButtonType =
    | 'default'
    | 'primary'
    | 'ghost'
    | 'dashed'
    | 'link'
    | 'text';

export type SizeType = 'small' | 'medium' | 'large';

export type ButtonProps = {
    type?: ButtonType;
    size?: SizeType;
    icon?: React.ReactNode;
    className?: string;
    children?: React.ReactNode;
    onClick?: React.MouseEventHandler<HTMLElement>;
    style?: React.CSSProperties;
};

export default function Button(props: ButtonProps) {
    const { className, type, style, size, children } = props;
    const classes = clsx(
        styles('ligoButton'),
        {
            [`${styles('ligoButton')}-${type}`]: type,
            [`${styles('ligoButton')}-icon-only`]: !children && children !== 0,
        },
        className
    );
    const handleClick = (
        e: React.MouseEvent<HTMLButtonElement | HTMLAnchorElement, MouseEvent>
    ) => {
        const { onClick } = props;
        (
            onClick as React.MouseEventHandler<
                HTMLButtonElement | HTMLAnchorElement
            >
        )?.(e);
    };
    return (
        <button className={classes} style={style || {}} onClick={handleClick}>
            {children}
        </button>
    );
}
