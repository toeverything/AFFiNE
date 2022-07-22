interface TreeItem {
    id: string;
    title: string;
    children?: TreeItem[];
}

interface PageConfigItem {
    id: string;
    title?: string;
    lastOpenTime: number;
}

export type { TreeItem, PageConfigItem };
