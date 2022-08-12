import { FC, useEffect, useMemo, useState } from 'react';

import { InlineRefLink } from '@toeverything/components/common';
import { CreateView } from '@toeverything/framework/virgo';

type RefLinkView = CreateView;

export const RefLinkView = ({ block, editor }: RefLinkView) => {
    const page_id = useMemo(() => block.getProperty('reference'), [block]);

    const [block_content, set_block] =
        useState<Awaited<ReturnType<typeof editor.search>>[number]>();

    useEffect(() => {
        editor
            .search({ tag: `id:${page_id}` })
            .then(block => set_block(block[0]));
    }, [editor, page_id]);

    return <InlineRefLink block={block_content} pageId={page_id} />;
};
