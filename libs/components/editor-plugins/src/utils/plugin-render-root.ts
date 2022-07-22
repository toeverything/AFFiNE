import type { ReactNode } from 'react';
import type { PatchNode, UnPatchNode } from '@toeverything/components/ui';

interface PluginRenderRootProps {
    name: string;
    render: PatchNode;
}
export class PluginRenderRoot {
    readonly name: string;
    readonly patch: PatchNode;
    private un_patch: UnPatchNode;
    private root: ReactNode;
    public isMounted = false;

    constructor({ name, render }: PluginRenderRootProps) {
        this.name = name;
        this.patch = render;
    }

    render(node?: ReactNode) {
        this.root = node;
        if (this.isMounted) {
            this.mount();
        }
    }

    mount() {
        this.un_patch = this.patch(this.name, this.root);
        this.isMounted = true;
    }

    unmount() {
        this.un_patch?.();
        this.isMounted = false;
    }
}
