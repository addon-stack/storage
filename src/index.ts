export {StorageCorruptionError, StoragePartialUpdateError} from "./errors";
export {default as LockManager} from "./LockManager";
export {MonoStorage, SecureStorage, Storage} from "./providers";
export type {SecureStorageOptions, StorageOptions} from "./providers";
export type {
    StorageBatchUpdateOptions,
    StorageBatchUpdater,
    StorageChanges,
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
