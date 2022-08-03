import { RecastPropertyId } from './types';

// TODO: The logic for keeping history should be supported by the network layer
type Props = {
    recastBlockId: string;
    blockId: string;
    propertyId: RecastPropertyId;
};

type HistoryStorageMap = {
    [recastBlockId: string]: {
        [propertyId: RecastPropertyId]: string;
    };
};

const LOCAL_STORAGE_NAME = 'TEMPORARY_HISTORY_DATA';

const ensureLocalStorage = () => {
    const data = localStorage.getItem(LOCAL_STORAGE_NAME);
    if (!data) {
        localStorage.setItem(LOCAL_STORAGE_NAME, JSON.stringify({}));
    }
};

export const setHistory = ({ recastBlockId, blockId, propertyId }: Props) => {
    ensureLocalStorage();
    const data: HistoryStorageMap = JSON.parse(
        localStorage.getItem(LOCAL_STORAGE_NAME) as string
    );

    if (!data[recastBlockId]) {
        data[recastBlockId] = {};
    }
    const propertyValueRecord = data[recastBlockId];
    propertyValueRecord[propertyId] = blockId;

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
    propertyId,
}: {
    recastBlockId: string;
    propertyId: RecastPropertyId;
}) => {
    ensureLocalStorage();
    const data: HistoryStorageMap = JSON.parse(
        localStorage.getItem(LOCAL_STORAGE_NAME) as string
    );
    if (!data[recastBlockId]) {
        return;
    }

    delete data[recastBlockId][propertyId];

    localStorage.setItem(LOCAL_STORAGE_NAME, JSON.stringify(data));
};
