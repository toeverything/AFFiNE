import EventEmitter from 'eventemitter3';
import { createNoopWithMessage } from '@toeverything/utils';
import type {
    Virgo,
    Plugin,
    PluginCreator,
    PluginHooks,
    PluginManagerInterface,
} from '../types';

export class PluginManager implements PluginManagerInterface {
    private editor: Virgo;
    private hooks: PluginHooks;
    private plugins: Record<string, Plugin> = {};
    private emitter = new EventEmitter();

    constructor(editor: Virgo, hooks: PluginHooks) {
        this.editor = editor;
        this.hooks = hooks;
    }

    register(createPlugin: PluginCreator): void {
        const plugin: Plugin = new createPlugin(this.editor, this.hooks);
        createNoopWithMessage({
            module: 'plugin/manager',
            message: 'Plugin registered: ' + createPlugin.pluginName,
        })();
        plugin.init();
        this.plugins[createPlugin.pluginName] = plugin;
    }

    registerAll(createPlugins: PluginCreator[]): void {
        createPlugins.sort((a: PluginCreator, b: PluginCreator): number => {
            return a.priority - b.priority;
        });
        createPlugins.forEach((pluginCreator: PluginCreator): void => {
            this.register(pluginCreator);
        });
    }

    deregister(pluginName: string): void {
        const plugin: Plugin | undefined = this.plugins[pluginName];
        try {
            plugin?.dispose();
        } catch (error) {
            console.error(error);
        }
        delete this.plugins[pluginName];
    }

    dispose() {
        Object.entries(this.plugins).forEach(([pluginName, plugin]) => {
            try {
                plugin.dispose();
            } catch (error) {
                console.error(error);
            }
            delete this.plugins[pluginName];
        });
    }

    observe(
        name: string,
        callback: (
            ...args: Array<unknown>
        ) => Promise<Record<string, unknown>> | void
    ): void {
        this.emitter.on(name, callback);
    }
    unobserve(
        name: string,
        callback: (
            ...args: Array<unknown>
        ) => Promise<Record<string, unknown>> | void
    ): void {
        this.emitter.off(name, callback);
    }
    emitAsync(name: string, ...params: Array<unknown>): Promise<any[]> {
        // return this.emitter.emitAsync(name, params);
        return {} as any;
    }
    emit(name: string, ...params: Array<unknown>): void {
        this.emitter.emit(name, params);
    }
    public getPlugin(pluginName: string): Plugin {
        return this.plugins[pluginName];
    }
}
