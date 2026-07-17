export type StorageState = Record<string, any>;

export type StorageSetValue<T> = T & (NonNullable<unknown> | null);

export type StorageListenerResult = void | Promise<void>;

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

/**
 * Equality check for `update()`. Return `true` to treat values as equal and skip the write.
 *
 * The comparer is not called when the updater returns `undefined`.
 * For `SecureStorage`, values are decrypted before comparison.
 */
export type StorageUpdateComparer<T> = (prev: T | undefined, next: T | undefined) => boolean;

export interface StorageUpdateOptions<T> extends StorageLockOptions {
    /**
     * Custom equality check for this update. Return `true` to skip the physical write.
     */
    compare?: StorageUpdateComparer<T>;
}

export type StorageBatchUpdater<T extends StorageState = StorageState, K extends keyof T = keyof T> = (
    prev: Partial<Pick<T, K>>
) => Partial<Pick<T, K>> | Promise<Partial<Pick<T, K>>>;

export interface StorageBatchUpdateOptions<T extends StorageState = StorageState, K extends keyof T = keyof T>
    extends StorageLockOptions {
    /**
     * Per-key equality checks. Return `true` to skip the physical writing for that key.
     */
    compare?: Partial<{[P in K]: StorageUpdateComparer<T[P]>}>;
}

export type StorageWatchCallback<T = StorageState> = <K extends keyof T>(
    newValue: T[K] | undefined,
    oldValue: T[K] | undefined,
    key: K
) => StorageListenerResult;

export type StorageWatchKeyCallback<T = StorageState> = {
    [K in keyof T]?: (newValue: T[K] | undefined, oldValue: T[K] | undefined) => StorageListenerResult;
};

export type StorageWatchOptions<T = StorageState> = StorageWatchKeyCallback<T> | StorageWatchCallback<T>;

export type StorageChanges<T extends StorageState = StorageState> = Partial<{
    [K in keyof T]: {
        newValue: T[K] | undefined;
        oldValue: T[K] | undefined;
    };
}>;

export type StorageSubscriber<T extends StorageState = StorageState> = (
    changes: StorageChanges<T>
) => StorageListenerResult;

// prettier-ignore
export interface StorageProvider<T extends StorageState = StorageState> {
    set<K extends keyof T>(key: K, value: StorageSetValue<T[K]>): Promise<void>;

    set(values: Partial<T>): Promise<void>;

    update<K extends keyof T>(
        key: K,
        updater: StorageUpdater<T[K]>,
        options?: StorageUpdateOptions<T[K]>
    ): Promise<T[K] | undefined>;

    update<K extends keyof T>(
        keys: readonly K[],
        updater: StorageBatchUpdater<T, K>,
        options?: StorageBatchUpdateOptions<T, K>
    ): Promise<Partial<Pick<T, K>>>;

    get<K extends keyof T>(key: K): Promise<T[K] | undefined>;

    get<K extends keyof T>(keys: readonly K[]): Promise<Partial<Pick<T, K>>>;

    getAll(): Promise<Partial<T>>;

    remove<K extends keyof T>(keys: K | K[], options?: StorageLockOptions): Promise<void>;

    clear(options?: StorageLockOptions): Promise<void>;

    watch(options: StorageWatchOptions<T>): () => void;

    subscribe(callback: StorageSubscriber<T>): () => void;
}
