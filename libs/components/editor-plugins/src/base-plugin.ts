import {
    HookType,
    Virgo,
    Plugin,
    PluginHooks,
} from '@toeverything/framework/virgo';
import { genErrorObj } from '@toeverything/utils';

export abstract class BasePlugin implements Plugin {
    protected editor: Virgo;
    protected hooks: PluginHooks;
    private hook_queue: [type: HookType, fn: (...args: unknown[]) => void][] =
        [];
    private is_disposed = false;

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
        // TODO perfect it
        this.hooks = {
            addHook: (...args) => {
                this.hook_queue.push([args[0], args[1]]);
                return hooks.addHook(...args);
            },
            addOnceHook(...args) {
                return hooks.addHook(...args);
            },
            // TODO fix remove
            removeHook(...args) {
                return hooks.removeHook(...args);
            },
        };
        this._onRender = this._onRender.bind(this);
        hooks.addHook(HookType.RENDER, this._onRender, this);
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
        if (this.is_disposed) {
            console.warn(`Plugin '${pluginName}' already disposed`);
            return;
        }
        this.is_disposed = true;
        // FIX will remove hook multiple times
        // if the hook has been removed manually
        // or set once flag when add hook
        this.hook_queue.forEach(([type, fn]) => {
            this.hooks.removeHook(type, fn);
        });
        this.hook_queue = [];

        const errorMsg = `You are trying to access an invalid editor or hooks.
                The plugin '${pluginName}' has been disposed.
                Make sure all hooks are removed before dispose.`;

        this.editor = genErrorObj(errorMsg) as Virgo;
        this.hooks = genErrorObj(errorMsg) as PluginHooks;
    }
}
