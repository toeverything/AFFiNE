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
import { Block2HtmlProps } from '../../utils/commonBlockClip';

export class FileBlock extends BaseView {
    public override selectable = true;
    public override activatable = false;
    type = Protocol.Block.Type.file;
    View = FileView;
    override async block2html({ block }: Block2HtmlProps) {
        const fileProperty = block.getProperty('file');
        const fileId = fileProperty?.value;
        const fileInfo = fileId
            ? await services.api.file.get(fileId, block.workspace)
            : null;

        return fileInfo
            ? `<p><a href=${fileInfo?.url}>${fileProperty?.name}</a></p>`
            : '';
    }
}
