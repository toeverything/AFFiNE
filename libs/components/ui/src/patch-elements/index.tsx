import type { ReactNode } from 'react';
import { useState, Fragment } from 'react';
import { has } from '@toeverything/utils';

export type UnPatchNode = () => void;
export type PatchNode = (key: string, node: ReactNode) => UnPatchNode;

export const usePatchNodes = () => {
    const [nodes, set_nodes] = useState<Record<string, ReactNode>>({});

    const patch_node: PatchNode = (key: string, node: ReactNode) => {
        set_nodes(oldNodes => ({ ...oldNodes, [key]: node }));
        return () => {
            set_nodes(oldNodes => {
                const nodes = { ...oldNodes };
                delete nodes[key];
                return nodes;
            });
        };
    };

    const has_node = (key: string) => {
        return has(nodes, key);
    };

    const patched_nodes = (
        <>
            {Object.entries(nodes).map(([key, node]) => {
                return <Fragment key={key}>{node}</Fragment>;
            })}
        </>
    );

    return {
        patch: patch_node,
        has: has_node,
        patchedNodes: patched_nodes,
    };
};
