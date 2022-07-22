import {
    AsyncBlock,
    BaseView,
    SelectBlock,
} from '@toeverything/framework/virgo';
import {
    FileColumnValue,
    Protocol,
    services,
} from '@toeverything/datasource/db-service';
import { FileView } from './FileView';

export class FileBlock extends BaseView {
    public override selectable = true;
    public override activatable = false;
    type = Protocol.Block.Type.file;
    View = FileView;

    override async block2html(
        block: AsyncBlock,
        children: SelectBlock[],
        generateHtml: (el: any[]) => Promise<string>
    ): Promise<string> {
        const file_property =
            block.getProperty('file') || ({} as FileColumnValue);
        const file_id = file_property.value;
        let file_info = null;
        if (file_id) {
            file_info = await services.api.file.get(file_id, block.workspace);
        }
        return `<p><a src=${file_info?.url}>${file_property?.name}</p>`;
    }
}
