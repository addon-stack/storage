import type {StorageProvider, StorageState} from "../src/types";

declare global {
    var storageLocalGet: (key: string | string[], storage?: StorageProvider<StorageState>) => Promise<any>;

    var simulateStorageChange: (params: {
        storage: StorageProvider<StorageState>;
        key: string;
        oldValue: any;
        newValue: any;
        areaName?: chrome.storage.AreaName;
    }) => void;

    var simulateSecureStorageChange: (params: {
        storage: StorageProvider<StorageState>;
        key: string;
        oldValue: any;
        newValue: any;
        areaName?: chrome.storage.AreaName;
    }) => Promise<void>;
}
