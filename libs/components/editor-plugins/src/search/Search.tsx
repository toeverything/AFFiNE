import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import style9 from 'style9';

import { BlockPreview } from '@toeverything/components/common';
import {
    TransitionsModal,
    MuiBox as Box,
    MuiBox,
} from '@toeverything/components/ui';
import { Virgo, BlockEditor } from '@toeverything/framework/virgo';
import { throttle } from '@toeverything/utils';

const styles = style9.create({
    wrapper: {
        position: 'absolute',
        top: '20%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        width: '50vw',
        display: 'flex',
        flexDirection: 'column',
    },
    search: {
        margin: '0.5em',
        backgroundColor: 'white',
        boxShadow: '0px 1px 10px rgb(152 172 189 / 60%)',
        padding: '16px 32px',
        borderRadius: '10px',
    },
    result: {
        margin: '0.5em',
        backgroundColor: 'white',
        boxShadow: '0px 1px 10px rgb(152 172 189 / 60%)',
        padding: '16px 32px',
        borderRadius: '10px',
        transitionProperty: 'max-height',
        transitionDuration: '300ms',
        transitionTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)',
        transitionDelay: '0ms',
        overflowX: 'hidden',
        overflowY: 'hidden',
    },
    result_hide: {
        opacity: 0,
    },
});

export type QueryResult = Awaited<ReturnType<BlockEditor['search']>>;

const query_blocks = (
    editor: Virgo,
    search: string,
    callback: (result: QueryResult) => void
) => {
    (editor as BlockEditor).search(search).then(pages => callback(pages));
};

export const QueryBlocks = throttle(query_blocks, 500);

type SearchProps = {
    onClose: () => void;
    editor: Virgo;
};

export const Search = (props: SearchProps) => {
    const { workspace_id } = useParams();
    const navigate = useNavigate();

    const [open, set_open] = useState(true);
    const [search, set_search] = useState('');
    const [result, set_result] = useState<QueryResult>([]);

    useEffect(() => {
        QueryBlocks(props.editor, search, result => {
            set_result(result);
        });
    }, [props.editor, search]);

    const handle_navigate = useCallback(
        (id: string) => navigate(`/${workspace_id}/${id}`),
        [navigate, workspace_id]
    );

    return (
        <TransitionsModal
            open={open}
            onClose={() => {
                set_open(false);
                props.onClose();
            }}
        >
            <Box className={styles('wrapper')}>
                <input
                    className={styles('search')}
                    autoFocus
                    value={search}
                    onChange={e => set_search(e.target.value)}
                />
                <MuiBox
                    sx={{ maxHeight: `${result.length * 28 + 32 + 20}px` }}
                    className={styles('result', {
                        result_hide: !result.length,
                    })}
                >
                    {result
                        // 过滤掉空标题的文档
                        .filter(block => block.content)
                        .map(block => (
                            <BlockPreview
                                key={block.id}
                                block={block}
                                onClick={() => handle_navigate(block.id)}
                            />
                        ))}
                </MuiBox>
            </Box>
        </TransitionsModal>
    );
};
