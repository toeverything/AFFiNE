import { BlockCommands, TextCommands } from './commands';

/**
 *
 * commands for operate servers
 * @export
 * @class Commands
 */
export class Commands {
    public blockCommands: BlockCommands;
    public textCommands: TextCommands;
    constructor(workspace: string) {
        this.blockCommands = new BlockCommands(workspace);
        this.textCommands = new TextCommands(workspace);
    }
}
