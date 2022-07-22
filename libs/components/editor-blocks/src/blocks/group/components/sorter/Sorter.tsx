import { HelpCenterIcon } from '@toeverything/components/icons';
import { SorterSelector } from './SorterSelector';
import { GroupBySelector } from './GroupBySelector';
import { Panel } from '../Panel';
import { Title } from '../Title';
import type { ClosePanel } from '../../types';
import type { AsyncBlock } from '@toeverything/framework/virgo';

const extraStyle = {
    width: 400,
};

const Sorter = ({
    closePanel,
    block,
}: {
    closePanel: ClosePanel;
    block: AsyncBlock;
}) => {
    /* remain：probably won't use */
    const makeView = () => {
        /* create a view */
        closePanel();
    };

    return (
        <Panel extraStyle={extraStyle}>
            <GroupBySelector />
            <div>
                <Title>
                    <div>Sort by</div>
                    <HelpCenterIcon fontSize="small" />
                </Title>

                <SorterSelector block={block} />
            </div>
        </Panel>
    );
};

export { Sorter };
