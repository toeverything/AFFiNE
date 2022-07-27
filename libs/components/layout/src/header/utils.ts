import { TreeItem, TreeItems } from './../workspace-sidebar/page-tree';

const pickPath = (treeItems: TreeItem | TreeItems, targetId: string) => {
    const pick = (tree: TreeItem, result: TreeItem[] = []) => {
        if (tree.id === targetId) {
            result.push(tree);
            return result;
        }

        for (const child of tree?.children || []) {
            if (pick(child, result).length) {
                result.unshift(tree);
                break;
            }
        }

        return result;
    };

    return (Array.isArray(treeItems) ? treeItems : [treeItems]).map(treeItem =>
        pick(treeItem)
    );
};

export { pickPath };
