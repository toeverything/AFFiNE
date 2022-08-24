import { BlockPreview } from '@toeverything/components/common';
import {
    MuiBox as Box,
    MuiBox,
    styled,
    TransitionsModal,
} from '@toeverything/components/ui';
import {
    BlockEditor,
    HookType,
    PluginHooks,
    Virgo,
} from '@toeverything/framework/virgo';
import { throttle } from '@toeverything/utils';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import style9 from 'style9';

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
    resultItem: {
        width: '100%',
    },
    resultHide: {
        opacity: 0,
    },
});

export type QueryResult = Awaited<ReturnType<BlockEditor['search']>>;

const queryBlocksExec = (
    editor: Virgo,
    search: string,
    callback: (result: QueryResult) => void
) => {
    (editor as BlockEditor).search(search).then(pages => callback(pages));
};

export const QueryBlocks = throttle(queryBlocksExec, 500);

type SearchProps = {
    editor: Virgo;
    hooks: PluginHooks;
};

export const Search = (props: SearchProps) => {
    const { workspace_id: workspaceId } = useParams();
    const navigate = useNavigate();

    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState<string>();
    const [result, setResult] = useState<QueryResult>([]);

    useEffect(() => {
        search !== undefined &&
            QueryBlocks(props.editor, search, result => {
                setResult(result);
            });
    }, [props.editor, search]);

    const handleNavigate = useCallback(
        (id: string) => navigate(`/${workspaceId}/${id}`),
        [navigate, workspaceId]
    );

    const handleSearch = useCallback(() => {
        setOpen(true);
        setSearch('');
    }, []);

    useEffect(() => {
        const sub = props.hooks.get(HookType.ON_SEARCH).subscribe(handleSearch);

        return () => {
            sub.unsubscribe();
        };
    }, [props, handleSearch]);

    return (
        <TransitionsModal
            open={open}
            onClose={() => {
                setOpen(false);
            }}
        >
            <Box className={styles('wrapper')}>
                <SearchInput
                    autoFocus
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                />
                <ResultContainer
                    sx={{ maxHeight: `${result.length * 28 + 32 + 20}px` }}
                    className={styles({
                        resultHide: !result.length,
                    })}
                >
                    {result.map(block => (
                        <BlockPreview
                            className={styles('resultItem')}
                            key={block.id}
                            block={{
                                ...block,
                                content: block.content || 'Untitled',
                            }}
                            onClick={() => {
                                handleNavigate(block.id);
                            }}
                        />
                    ))}
                </ResultContainer>
            </Box>
        </TransitionsModal>
    );
};

const SearchInput = styled('input')(({ theme }) => ({
    margin: '0.5em',
    backgroundColor: 'white',
    boxShadow: theme.affine.shadows.shadow1,
    padding: '16px 32px',
    borderRadius: '10px',
}));

const ResultContainer = styled(MuiBox)(({ theme }) => ({
    margin: '0.5em',
    backgroundColor: 'white',
    boxShadow: theme.affine.shadows.shadow1,
    padding: '16px 32px',
    borderRadius: '10px',
    transitionProperty: 'max-height',
    transitionDuration: '300ms',
    transitionTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)',
    transitionDelay: '0ms',
    overflowX: 'hidden',
    overflowY: 'hidden',
}));
