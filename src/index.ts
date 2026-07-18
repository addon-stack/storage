export {StorageCorruptionError, StoragePartialUpdateError} from "./errors";
export {
    storage,
    storageLocal,
    storageManaged,
    storageSecure,
    storageSession,
    storageSync,
} from "./helpers";
export {WebLockManager} from "./locking";
export {MonoStorage, SecureStorage, Storage} from "./providers";
export type {
    SecureStorageHelperOptions,
    StorageAreaHelperOptions,
    StorageHelperOptions,
} from "./helpers";
export type {SecureStorageOptions, StorageOptions} from "./providers";
export type {
    StorageBatchSnapshot,
    StorageBatchUpdateComparer,
    StorageBatchUpdateOptions,
    StorageBatchUpdater,
    StorageChanges,
    StorageHelper,
    StorageListenerResult,
    StorageLocker,
    StorageLockOptions,
    StorageProvider,
    StorageSetValue,
    StorageState,
    StorageSubscriber,
    StorageUpdateComparer,
    StorageUpdateOptions,
    StorageUpdater,
    StorageWatchCallback,
    StorageWatchKeyCallback,
    StorageWatchOptions,
} from "./types";
