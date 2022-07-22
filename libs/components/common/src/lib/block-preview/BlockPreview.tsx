import { PagesIcon } from '@toeverything/components/icons';
// eslint-disable-next-line @nrwl/nx/enforce-module-boundaries
import { BlockSearchItem } from '@toeverything/datasource/jwt';
import { ListButton } from '@toeverything/components/ui';

type BlockPreviewProps = {
    block: BlockSearchItem;
    className?: string;
    onClick?: () => void;
    onMouseOver?: () => void;
    hover?: boolean;
};

export const BlockPreview = (props: BlockPreviewProps) => {
    const { block } = props;

    return (
        <ListButton
            className={props.className}
            onClick={props.onClick}
            onMouseOver={props.onMouseOver}
            hover={props.hover}
            content={block.content}
            icon={PagesIcon}
        />
    );
};
