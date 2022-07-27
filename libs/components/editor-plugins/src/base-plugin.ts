import {
    Virgo,
    Plugin,
    PluginHooks,
    HookType,
} from '@toeverything/framework/virgo';
import { genErrorObj } from '@toeverything/utils';
import { Subscription } from 'rxjs';

export abstract class BasePlugin implements Plugin {
    protected editor: Virgo;
    protected hooks: PluginHooks;
    protected sub: Subscription;
    private _disposed = false;

    // Unique identifier to distinguish between different Plugins
    public static get pluginName(): string {
        throw new Error(
            "subclass need to implement 'get pluginName' property accessors."
        );
    }

    // Priority, the higher the number, the higher the priority
    public static get priority(): number {
        return 1;
    }

    constructor(editor: Virgo, hooks: PluginHooks) {
        this.editor = editor;
        this.hooks = hooks;
        this.sub = hooks.get(HookType.RENDER).subscribe(() => this._onRender());
    }

    /**
     * Only executed once during initialization
     */
    public init(): void {
        // implement in subclass
    }

    /**
     * will trigger multiple times
     */
    protected _onRender(): void {
        // implement in subclass
    }

    public dispose(): void {
        // See https://stackoverflow.com/questions/33387318/access-to-static-properties-via-this-constructor-in-typescript
        const pluginName = (this.constructor as typeof BasePlugin).pluginName;
        if (this._disposed) {
            console.warn(`Plugin '${pluginName}' already disposed`);
            return;
        }
        this.sub.unsubscribe();
        this._disposed = true;

        const errorMsg = `You are trying to access an invalid editor or hooks.
                The plugin '${pluginName}' has been disposed.
                Make sure all hooks are removed before dispose.`;

        this.editor = genErrorObj(errorMsg) as Virgo;
        this.hooks = genErrorObj(errorMsg) as PluginHooks;
    }
}
