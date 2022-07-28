import { BlockEditor } from '@toeverything/framework/virgo';
import {
    PageBlock,
    RefLinkBlock,
    TextBlock,
    Heading1Block,
    Heading2Block,
    Heading3Block,
    QuoteBlock,
    TodoBlock,
    CodeBlock,
    // TocBlock,
    FileBlock,
    ImageBlock,
    DividerBlock,
    CalloutBlock,
    YoutubeBlock,
    FigmaBlock,
    GroupBlock,
    EmbedLinkBlock,
    BulletBlock,
    NumberedBlock,
    GridBlock,
    GridItemBlock,
    GroupDividerBlock,
} from '@toeverything/components/editor-blocks';
import { Protocol } from '@toeverything/datasource/db-service';
import { plugins } from '@toeverything/components/editor-plugins';

export const createEditor = (
    workspace: string,
    rootBlockId: string,
    isWhiteboard?: boolean
) => {
    const blockEditor = new BlockEditor({
        workspace,
        rootBlockId,
        views: {
            [Protocol.Block.Type.page]: new PageBlock(),
            [Protocol.Block.Type.reference]: new RefLinkBlock(),
            [Protocol.Block.Type.text]: new TextBlock(),
            [Protocol.Block.Type.heading1]: new Heading1Block(),
            [Protocol.Block.Type.heading2]: new Heading2Block(),
            [Protocol.Block.Type.heading3]: new Heading3Block(),
            [Protocol.Block.Type.quote]: new QuoteBlock(),
            [Protocol.Block.Type.todo]: new TodoBlock(),
            [Protocol.Block.Type.code]: new CodeBlock(),
            // [Protocol.Block.Type.toc]: new TocBlock(),
            [Protocol.Block.Type.file]: new FileBlock(),
            [Protocol.Block.Type.image]: new ImageBlock(),
            [Protocol.Block.Type.divider]: new DividerBlock(),
            [Protocol.Block.Type.callout]: new CalloutBlock(),
            [Protocol.Block.Type.youtube]: new YoutubeBlock(),
            [Protocol.Block.Type.figma]: new FigmaBlock(),
            [Protocol.Block.Type.group]: new GroupBlock(),
            [Protocol.Block.Type.embedLink]: new EmbedLinkBlock(),
            [Protocol.Block.Type.numbered]: new NumberedBlock(),
            [Protocol.Block.Type.bullet]: new BulletBlock(),
            [Protocol.Block.Type.grid]: new GridBlock(),
            [Protocol.Block.Type.gridItem]: new GridItemBlock(),
            [Protocol.Block.Type.groupDivider]: new GroupDividerBlock(),
        },
        plugins,
        isWhiteboard,
    });

    return blockEditor;
};
