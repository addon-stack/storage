export {};

declare global {
    var resetStorageChangeListeners: () => void;

    var storageLocalGet: (key: string | string[], storage?: object) => Promise<any>;

    var simulateStorageChange: (params: {
        storage: object;
        key: string;
        oldValue: any;
        newValue: any;
        areaName?: chrome.storage.AreaName;
    }) => void;

    var simulateStorageChanges: (params: {
        storage: object;
        changes: Record<string, chrome.storage.StorageChange>;
        areaName?: chrome.storage.AreaName;
    }) => void;

    var simulateSecureStorageChange: (params: {
        storage: object;
        key: string;
        oldValue: any;
        newValue: any;
        areaName?: chrome.storage.AreaName;
    }) => Promise<void>;

    var simulateSecureStorageChanges: (params: {
        storage: object;
        changes: Record<string, chrome.storage.StorageChange>;
        areaName?: chrome.storage.AreaName;
    }) => Promise<void>;
}
