import type { ReactNode } from 'react';
import { useState, Fragment } from 'react';
import { has } from '@toeverything/utils';

export type UnPatchNode = () => void;
export type PatchNode = (key: string, node: ReactNode) => UnPatchNode;

export const usePatchNodes = () => {
    const [nodes, setNodes] = useState<Record<string, ReactNode>>({});

    const patchNode: PatchNode = (key: string, node: ReactNode) => {
        setNodes(oldNodes => ({ ...oldNodes, [key]: node }));
        return () => {
            setNodes(oldNodes => {
                const nodes = { ...oldNodes };
                delete nodes[key];
                return nodes;
            });
        };
    };

    const hasNode = (key: string) => {
        return has(nodes, key);
    };

    const patchedNodes = (
        <>
            {Object.entries(nodes).map(([key, node]) => {
                return <Fragment key={key}>{node}</Fragment>;
            })}
        </>
    );

    return {
        patch: patchNode,
        has: hasNode,
        patchedNodes: patchedNodes,
    };
};
