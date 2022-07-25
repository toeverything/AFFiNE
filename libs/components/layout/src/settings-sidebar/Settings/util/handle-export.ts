import { ClipboardParse } from '@toeverything/components/editor-core';
import { createEditor } from '@toeverything/components/affine-editor';
import { fileExporter } from './file-exporter';

interface CreateClipboardParseProps {
    workspaceId: string;
    rootBlockId: string;
}

const createClipboardParse = ({
    workspaceId,
    rootBlockId,
}: CreateClipboardParseProps) => {
    const editor = createEditor(workspaceId);
    editor.setRootBlockId(rootBlockId);

    return new ClipboardParse(editor);
};

interface ExportHandlerProps extends CreateClipboardParseProps {
    title: string;
}

export const exportHtml = async ({
    workspaceId,
    rootBlockId,
    title,
}: ExportHandlerProps) => {
    const clipboardParse = createClipboardParse({ workspaceId, rootBlockId });
    const htmlContent = await clipboardParse.page2html();
    fileExporter.exportHtml(title, htmlContent);
};

export const exportMarkdown = async ({
    workspaceId,
    rootBlockId,
    title,
}: ExportHandlerProps) => {
    const clipboardParse = createClipboardParse({ workspaceId, rootBlockId });
    const htmlContent = await clipboardParse.page2html();
    fileExporter.exportMarkdown(title, htmlContent);
};

export const clearWorkspace = async ({
    workspaceId,
    rootBlockId,
    title,
}: ExportHandlerProps) => {
    //@ts-ignore
    client.inspector().clear();
};
