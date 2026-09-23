export {StorageCorruptionError, StoragePartialUpdateError} from "./errors";
export type {
    SecureStorageHelperOptions,
    StorageAreaHelperOptions,
    StorageHelperOptions,
} from "./helpers";
export {
    storage,
    storageLocal,
    storageManaged,
    storageSecure,
    storageSession,
    storageSync,
} from "./helpers";
export {WebLockManager} from "./locking";
export {StorageStatus} from "./observer/types";
export type {SecureStorageOptions, StorageOptions} from "./providers";
export {MonoStorage, SecureStorage, Storage} from "./providers";
export type {
    StorageBatchPatch,
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
    StorageSubscribeOptions,
    StorageSubscriber,
    StorageUpdateComparer,
    StorageUpdateOptions,
    StorageUpdater,
    StorageWatchCallback,
    StorageWatchKeyCallback,
    StorageWatchOptions,
} from "./types";
