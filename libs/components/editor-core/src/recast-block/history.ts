import { RecastPropertyId } from './types';

// TODO: The logic for keeping history should be supported by the network layer
type Props = {
    recastBlockId: string;
    blockId: string;
    propertyId: RecastPropertyId;
};

type HistoryStorageMap = {
    [recastBlockId: string]: {
        [propertyId: RecastPropertyId]: string[];
    };
};

const LOCAL_STORAGE_NAME = 'TEMPORARY_HISTORY_DATA';

const ensureLocalStorage = () => {
    const data = localStorage.getItem(LOCAL_STORAGE_NAME);
    if (!data) {
        localStorage.setItem(LOCAL_STORAGE_NAME, JSON.stringify({}));
    }
};
const ensureHistoryAtom = (
    data: HistoryStorageMap,
    recastBlockId: string,
    propertyId: RecastPropertyId
): HistoryStorageMap => {
    if (!data[recastBlockId]) {
        data[recastBlockId] = {};
    }
    if (!data[recastBlockId][propertyId]) {
        data[recastBlockId][propertyId] = [];
    }
    return data;
};

export const setHistory = ({ recastBlockId, blockId, propertyId }: Props) => {
    ensureLocalStorage();
    const data: HistoryStorageMap = JSON.parse(
        localStorage.getItem(LOCAL_STORAGE_NAME) as string
    );
    ensureHistoryAtom(data, recastBlockId, propertyId);
    const propertyHistory = data[recastBlockId][propertyId];

    if (propertyHistory.includes(blockId)) {
        const idIndex = propertyHistory.findIndex(id => id === blockId);
        propertyHistory.splice(idIndex, 1);
    }

    propertyHistory.push(blockId);

    localStorage.setItem(LOCAL_STORAGE_NAME, JSON.stringify(data));
};

export const getHistory = ({ recastBlockId }: { recastBlockId: string }) => {
    ensureLocalStorage();
    const data: HistoryStorageMap = JSON.parse(
        localStorage.getItem(LOCAL_STORAGE_NAME) as string
    );

    return data[recastBlockId] ?? {};
};

export const removeHistory = ({
    recastBlockId,
    blockId,
    propertyId,
}: Props) => {
    ensureLocalStorage();
    const data: HistoryStorageMap = JSON.parse(
        localStorage.getItem(LOCAL_STORAGE_NAME) as string
    );
    ensureHistoryAtom(data, recastBlockId, propertyId);

    const propertyHistory = data[recastBlockId][propertyId];

    if (propertyHistory.includes(blockId)) {
        const idIndex = propertyHistory.findIndex(id => id === blockId);
        propertyHistory.splice(idIndex, 1);
    }

    localStorage.setItem(LOCAL_STORAGE_NAME, JSON.stringify(data));
};
