export type TOCType = {
    id: string;
    type: string;
    text: string;
};

export type ListenerMap = Map<string, () => void>;
