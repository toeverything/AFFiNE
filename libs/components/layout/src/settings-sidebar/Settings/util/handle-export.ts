import { createEditor } from '@toeverything/components/affine-editor';
import { fileExporter } from './file-exporter';

interface CreateClipboardParseProps {
    workspaceId: string;
    rootBlockId: string;
}

const createClipboardUtils = ({
    workspaceId,
    rootBlockId,
}: CreateClipboardParseProps) => {
    const editor = createEditor(workspaceId, rootBlockId);
    return editor.clipboard.clipboardUtils;
};

interface ExportHandlerProps extends CreateClipboardParseProps {
    title: string;
}

export const exportHtml = async ({
    workspaceId,
    rootBlockId,
    title,
}: ExportHandlerProps) => {
    const clipboardUtils = createClipboardUtils({ workspaceId, rootBlockId });
    fileExporter.exportHtml(title, await clipboardUtils.page2html());
};

export const exportMarkdown = async ({
    workspaceId,
    rootBlockId,
    title,
}: ExportHandlerProps) => {
    const clipboardUtils = createClipboardUtils({ workspaceId, rootBlockId });
    fileExporter.exportMarkdown(title, await clipboardUtils.page2html());
};
