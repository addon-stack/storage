export type StorageState = Record<string, any>;

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

    get<K extends keyof T>(key: K): Promise<T[K] | undefined>;

    getAll(): Promise<Partial<T>>;

    remove<K extends keyof T>(keys: K | K[]): Promise<void>;

    clear(): Promise<void>;

    watch(options: StorageWatchOptions<T>): () => void;
}
