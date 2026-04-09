export type StorageState = Record<string, any>;

export interface StorageLockOptions {
    /**
     * Cancels lock acquisition while the request is still queued.
     */
    signal?: AbortSignal;
    /**
     * Maximum time to wait for the lock in milliseconds.
     */
    timeout?: number;
}

export interface StorageLocker {
    request<T>(name: string, task: () => Promise<T>, options?: StorageLockOptions): Promise<T>;
}

export type StorageUpdater<T> = (prev: T | undefined) => T | undefined | Promise<T | undefined>;

export type StorageWatchCallback<T> = <K extends keyof T>(
    newValue: T[K] | undefined,
    oldValue: T[K] | undefined,
    key: K
) => void;

export type StorageWatchKeyCallback<T> = {
    [K in keyof T]?: (newValue: T[K] | undefined, oldValue: T[K] | undefined) => void;
};

export type StorageWatchOptions<T> = StorageWatchKeyCallback<T> | StorageWatchCallback<T>;

// prettier-ignore
export interface StorageProvider<T extends StorageState> {
    set<K extends keyof T>(key: K, value: T[K]): Promise<void>;

    update<K extends keyof T>(
        key: K,
        updater: StorageUpdater<T[K]>,
        options?: StorageLockOptions
    ): Promise<T[K] | undefined>;

    get<K extends keyof T>(key: K): Promise<T[K] | undefined>;

    getAll(): Promise<Partial<T>>;

    remove<K extends keyof T>(keys: K | K[], options?: StorageLockOptions): Promise<void>;

    clear(options?: StorageLockOptions): Promise<void>;

    watch(options: StorageWatchOptions<T>): () => void;
}
