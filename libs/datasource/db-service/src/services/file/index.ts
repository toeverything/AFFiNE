import { ServiceBaseClass } from '../base';

interface CreateParams {
    file: File;
    workspace: string;
}

interface ImageResult {
    id: string;
    url: string;
}
export class FileService extends ServiceBaseClass {
    urlMap: Record<string, string> = {};

    async create(params: CreateParams): Promise<ImageResult> {
        const { file, workspace } = params;
        // Get the current workspace block
        const workspace_db_block = await this.getWorkspaceDbBlock(workspace);
        // Get the workspace database link
        const db = await this.database.getDatabase(workspace);
        const binary = await file.arrayBuffer();
        // create a block of type file
        const file_db_block = await db.get('binary', {
            flavor: 'file',
            binary,
        });
        // add the file block to the workspace
        workspace_db_block.append(file_db_block);
        // cache the file
        const file_key = file_db_block.id + workspace;
        this.urlMap[file_key] = URL.createObjectURL(new Blob([binary]));
        return { id: file_db_block.id, url: this.urlMap[file_key] };
    }
    async get(file_block_id: string, workspace: string): Promise<ImageResult> {
        const file_key = file_block_id + workspace;
        if (this.urlMap[file_key]) {
            // lookup cache
            return { id: file_block_id, url: this.urlMap[file_key] };
        }
        const db = await this.database.getDatabase(workspace);
        const file_block = await db.get(file_block_id as 'binary');
        const file_buffer = file_block.getBinary();
        if (file_buffer) {
            this.urlMap[file_key] = URL.createObjectURL(
                new Blob([file_buffer])
            );
        } else {
            this.urlMap[file_key] = '';
        }
        return { id: file_block.id, url: this.urlMap[file_key] };
    }
}
