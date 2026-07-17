import {browser} from "@addon-core/browser";
import {callWithPromise, handleListener} from "@addon-core/browser/utils";
import {dequal as defaultCompare} from "dequal/lite";
import {planBatchUpdate} from "../batch";
import {StoragePartialUpdateError} from "../errors";
import {WebLockManager} from "../locking";
import {
    assertStorageKey,
    assertStorageNamespace,
    assertStorageSetValue,
    copyRecordWithoutPrototype,
    createRecord,
    hasOwn,
    invokeCallback,
    normalizeStorageNamespace,
    prepareStorageSetValues,
    scheduleUnhandledError,
    setRecordValue,
} from "../utils";
import {watchChanges} from "../watch";
import MonoStorage from "./MonoStorage";
import type {
    StorageBatchUpdateOptions,
    StorageBatchUpdater,
    StorageChanges,
    StorageLocker,
    StorageLockOptions,
    StorageProvider,
    StorageSetValue,
    StorageState,
    StorageSubscriber,
    StorageUpdateOptions,
    StorageUpdater,
    StorageWatchOptions,
} from "../types";

const storage = () => browser().storage as typeof chrome.storage;

type AreaName = chrome.storage.AreaName;
type StorageArea = chrome.storage.StorageArea;
type StorageChange = chrome.storage.StorageChange;
type onChangedListener = Parameters<typeof chrome.storage.onChanged.addListener>[0];

export interface StorageOptions {
    area?: AreaName;
    locker?: StorageLocker;
    namespace?: string;
}

type CtorOptions<C> = C extends new (options?: infer O) => any ? O : never;

type WithKey<T> = undefined extends T ? (Exclude<T, undefined> & {key?: string}) | undefined : T & {key?: string};

type OmitUndef<T, K extends PropertyKey> = undefined extends T
    ? Omit<Exclude<T, undefined>, K> | undefined
    : Omit<T, K>;

export type FactoryOptions<T> = WithKey<CtorOptions<T>>;

export type AreaOptions<T> = OmitUndef<FactoryOptions<T>, "area">;

export type StaticMake<S extends StorageState, O extends StorageOptions> = <
    T extends new (
        options?: O
    ) => StorageProvider<S>,
>(
    this: T,
    options?: FactoryOptions<T>
) => StorageProvider<S>;

export default abstract class AbstractStorage<T extends StorageState> implements StorageProvider<T> {
    private storage: StorageArea;
    private readonly area: AreaName;
    protected readonly locker: StorageLocker;
    protected readonly namespace?: string;

    public abstract clear(options?: StorageLockOptions): Promise<void>;

    protected abstract getFullKey(key: keyof T): string;

    protected abstract decodeFullKey(fullKey: string): keyof T | null;

    public static make<
        S extends StorageState,
        O extends StorageOptions = StorageOptions,
        T extends new (
            options?: O
        ) => StorageProvider<S> = new (
            options?: O
        ) => StorageProvider<S>,
    >(this: T, options?: FactoryOptions<T>): StorageProvider<S> {
        const {key, ...rest} = options || {};

        if (typeof key === "string" && key.trim() !== "") {
            assertStorageKey(key);
        }

        const storage = new this(rest as O);

        if (typeof key === "string" && key.trim() !== "") {
            return new MonoStorage<S, typeof key>(key, storage as StorageProvider<Record<typeof key, Partial<S>>>);
        }

        return storage;
    }

    public static Local<
        S extends StorageState,
        O extends StorageOptions = StorageOptions,
        T extends new (
            options?: O
        ) => StorageProvider<S> = new (
            options?: O
        ) => StorageProvider<S>,
    >(this: T & {make: StaticMake<S, O>}, options?: AreaOptions<T>): StorageProvider<S> {
        return this.make({
            ...(options || {}),
            area: "local",
        } as FactoryOptions<T>);
    }

    public static Session<
        S extends StorageState,
        O extends StorageOptions = StorageOptions,
        T extends new (
            options?: O
        ) => StorageProvider<S> = new (
            options?: O
        ) => StorageProvider<S>,
    >(this: T & {make: StaticMake<S, O>}, options?: AreaOptions<T>): StorageProvider<S> {
        return this.make({
            ...(options || {}),
            area: "session",
        } as FactoryOptions<T>);
    }

    public static Sync<
        S extends StorageState,
        O extends StorageOptions = StorageOptions,
        T extends new (
            options?: O
        ) => StorageProvider<S> = new (
            options?: O
        ) => StorageProvider<S>,
    >(this: T & {make: StaticMake<S, O>}, options?: AreaOptions<T>): StorageProvider<S> {
        return this.make({
            ...(options || {}),
            area: "sync",
        } as FactoryOptions<T>);
    }

    public static Managed<
        S extends StorageState,
        O extends StorageOptions = StorageOptions,
        T extends new (
            options?: O
        ) => StorageProvider<S> = new (
            options?: O
        ) => StorageProvider<S>,
    >(this: T & {make: StaticMake<S, O>}, options?: AreaOptions<T>): StorageProvider<S> {
        return this.make({
            ...(options || {}),
            area: "managed",
        } as FactoryOptions<T>);
    }

    protected constructor({area, locker, namespace}: StorageOptions = {}) {
        const normalizedNamespace = normalizeStorageNamespace(namespace);
        assertStorageNamespace(normalizedNamespace);

        this.area = area ?? "local";
        this.storage = storage()[this.area];
        this.locker = locker ?? new WebLockManager(`storage:${this.area}`);
        this.namespace = normalizedNamespace;
    }

    public set<K extends keyof T>(key: K, value: StorageSetValue<T[K]>): Promise<void>;
    public set(values: Partial<T>): Promise<void>;
    public async set<K extends keyof T>(keyOrValues: K | Partial<T>, value?: T[K]): Promise<void> {
        if (arguments.length === 1) {
            const values = prepareStorageSetValues<Partial<T>>(keyOrValues);

            for (const key of Object.keys(values) as (keyof T)[]) {
                assertStorageKey(key);
            }

            await this.setBatchUnlocked(values);
            return;
        }

        assertStorageKey(keyOrValues as K);
        assertStorageSetValue(value);
        await this.setUnlocked(keyOrValues as K, value as T[K]);
    }

    public update<K extends keyof T>(
        key: K,
        updater: StorageUpdater<T[K]>,
        options?: StorageUpdateOptions<T[K]>
    ): Promise<T[K] | undefined>;
    public update<K extends keyof T>(
        keys: readonly K[],
        updater: StorageBatchUpdater<T, K>,
        options?: StorageBatchUpdateOptions<T, K>
    ): Promise<Partial<Pick<T, K>>>;
    public async update<K extends keyof T>(
        keyOrKeys: K | readonly K[],
        updater: StorageUpdater<T[K]> | StorageBatchUpdater<T, K>,
        options?: StorageUpdateOptions<T[K]> | StorageBatchUpdateOptions<T, K>
    ): Promise<T[K] | undefined | Partial<Pick<T, K>>> {
        if (Array.isArray(keyOrKeys)) {
            return await this.updateBatch(
                keyOrKeys as readonly K[],
                updater as StorageBatchUpdater<T, K>,
                options as StorageBatchUpdateOptions<T, K> | undefined
            );
        }

        return await this.updateSingle(
            keyOrKeys as K,
            updater as StorageUpdater<T[K]>,
            options as StorageUpdateOptions<T[K]> | undefined
        );
    }

    private async updateSingle<K extends keyof T>(
        key: K,
        updater: StorageUpdater<T[K]>,
        options?: StorageUpdateOptions<T[K]>
    ): Promise<T[K] | undefined> {
        const {compare = defaultCompare, ...lockOptions} = options ?? {};

        return await this.locker.request(
            this.getLockKey(key),
            async () => {
                const prev = await this.getUnlocked(key);
                const next = await updater(prev);

                if (next === undefined) {
                    if (prev === undefined) {
                        return undefined;
                    }

                    await this.removeUnlocked(key);
                    return undefined;
                }

                if (compare(prev, next)) {
                    return next;
                }

                await this.setUnlocked(key, next);

                return next;
            },
            lockOptions
        );
    }

    private async updateBatch<K extends keyof T>(
        keys: readonly K[],
        updater: StorageBatchUpdater<T, K>,
        options?: StorageBatchUpdateOptions<T, K>
    ): Promise<Partial<Pick<T, K>>> {
        const uniqueKeys = this.getUniqueKeys(keys);

        if (uniqueKeys.length === 0) {
            return {};
        }

        const {compare, ...lockOptions} = options ?? {};

        return await this.requestLocks(
            uniqueKeys,
            async () => {
                const previous = await this.getBatchUnlocked(uniqueKeys);
                const patch = await updater(copyRecordWithoutPrototype(previous));
                const {next, valuesToSet, keysToRemove} = planBatchUpdate(uniqueKeys, previous, patch, compare);
                const setKeys = uniqueKeys.filter(key => hasOwn(valuesToSet, key));

                if (setKeys.length > 0) {
                    await this.setBatchUnlocked(valuesToSet as Partial<T>);
                }

                if (keysToRemove.length > 0) {
                    try {
                        await this.removeUnlocked(keysToRemove);
                    } catch (error) {
                        if (setKeys.length > 0) {
                            throw new StoragePartialUpdateError<T>(setKeys, keysToRemove, error);
                        }

                        throw error;
                    }
                }

                return next;
            },
            lockOptions
        );
    }

    public get<K extends keyof T>(key: K): Promise<T[K] | undefined>;
    public get<K extends keyof T>(keys: readonly K[]): Promise<Partial<Pick<T, K>>>;
    public async get<K extends keyof T>(keyOrKeys: K | readonly K[]): Promise<T[K] | undefined | Partial<Pick<T, K>>> {
        if (Array.isArray(keyOrKeys)) {
            return await this.getBatchUnlocked(keyOrKeys as readonly K[]);
        }

        return await this.getUnlocked(keyOrKeys as K);
    }

    public async getAll(): Promise<Partial<T>> {
        return await this.getAllStoredValues();
    }

    protected async getAllStoredValues(): Promise<Partial<T>> {
        const result = await this.getStoredItems(null);
        const formattedResult = createRecord<Partial<Record<keyof T, T[keyof T]>>>();

        for (const [key, value] of Object.entries(result)) {
            const logicalKey = this.decodeFullKey(key);

            if (logicalKey !== null) {
                setRecordValue(formattedResult, logicalKey, value as T[keyof T]);
            }
        }

        return formattedResult as Partial<T>;
    }

    protected async getStoredItems(keys: string | string[] | null): Promise<Record<string, unknown>> {
        return await callWithPromise(resolve => {
            this.storage.get(keys, result => {
                const items = createRecord<Record<string, unknown>>();

                for (const [key, value] of Object.entries(result)) {
                    setRecordValue(items, key, value);
                }

                resolve(items);
            });
        });
    }

    public async remove<K extends keyof T>(keys: K | K[], options?: StorageLockOptions): Promise<void> {
        const list = this.getUniqueKeys(Array.isArray(keys) ? keys : [keys]);

        if (list.length === 0) {
            return;
        }

        await this.requestLocks(list, async () => await this.removeUnlocked(list), options);
    }

    protected async setUnlocked<K extends keyof T>(key: K, value: T[K]): Promise<void> {
        return await callWithPromise<void>(resolve => {
            this.storage.set({[this.getFullKey(key)]: value}, () => {
                resolve();
            });
        });
    }

    protected async setBatchUnlocked(values: Partial<T>): Promise<void> {
        const items: Record<string, T[keyof T] | undefined> = {};

        for (const key of Object.keys(values) as (keyof T)[]) {
            setRecordValue(items, this.getFullKey(key), values[key]);
        }

        if (Object.keys(items).length === 0) {
            return;
        }

        return await callWithPromise<void>(resolve => {
            this.storage.set(items, () => {
                resolve();
            });
        });
    }

    protected async getUnlocked<K extends keyof T>(key: K): Promise<T[K] | undefined> {
        const fullKey = this.getFullKey(key);
        const result = await this.getStoredItems(fullKey);

        return hasOwn(result, fullKey) ? (result[fullKey] as T[K] | undefined) : undefined;
    }

    protected async getBatchUnlocked<K extends keyof T>(keys: readonly K[]): Promise<Partial<Pick<T, K>>> {
        const keyEntries = this.getUniqueKeys(keys).map(key => ({key, fullKey: this.getFullKey(key)}));

        if (keyEntries.length === 0) {
            return {};
        }

        const result = await this.getStoredItems(keyEntries.map(({fullKey}) => fullKey));
        const values = createRecord<Partial<Pick<T, K>>>();

        for (const {key, fullKey} of keyEntries) {
            if (hasOwn(result, fullKey)) {
                setRecordValue(values, key, result[fullKey] as T[K] | undefined);
            }
        }

        return values;
    }

    protected async removeUnlocked<K extends keyof T>(keys: K | K[]): Promise<void> {
        return await callWithPromise<void>(resolve => {
            const fullKeys = Array.isArray(keys) ? keys.map(key => this.getFullKey(key)) : this.getFullKey(keys);

            this.storage.remove(fullKeys, () => {
                resolve();
            });
        });
    }

    public watch(watcher: StorageWatchOptions<T>): () => void {
        if (typeof watcher !== "function") {
            for (const key of Object.keys(watcher) as (keyof T)[]) {
                assertStorageKey(key);
            }
        }

        return watchChanges<T>(callback => this.subscribe(callback), watcher);
    }

    public subscribe(callback: StorageSubscriber<T>): () => void {
        const queue: [keyof T, StorageChange][][] = [];
        let disposed = false;
        let processing = false;
        let removeNativeListener: () => void = () => undefined;

        const dispose = (): void => {
            if (disposed) {
                return;
            }

            disposed = true;
            queue.length = 0;
            removeNativeListener();
        };

        const processQueue = async (): Promise<void> => {
            if (processing || disposed) {
                return;
            }

            processing = true;

            try {
                while (!disposed && queue.length > 0) {
                    const entries = queue.shift();

                    if (!entries) {
                        continue;
                    }

                    const formattedEntries: Awaited<ReturnType<typeof this.formatChange<T>>>[] = [];

                    for (const [key, change] of entries) {
                        const formattedChange = await this.formatChange<T>(key, change);

                        if (disposed) {
                            return;
                        }

                        formattedEntries.push(formattedChange);
                    }

                    const formattedChanges = createRecord<StorageChanges<T>>();

                    for (const {key, newValue, oldValue} of formattedEntries) {
                        if (defaultCompare(newValue, oldValue)) {
                            continue;
                        }

                        setRecordValue(formattedChanges, key, {newValue, oldValue});
                    }

                    if (!disposed && Object.keys(formattedChanges).length > 0) {
                        invokeCallback(() => callback(formattedChanges));
                    }
                }
            } catch (error) {
                if (!disposed) {
                    dispose();
                    scheduleUnhandledError(error);
                }
            } finally {
                processing = false;
            }
        };

        const listener: onChangedListener = (changes: Record<string, StorageChange>, area: AreaName) => {
            if (disposed || area !== this.area) {
                return;
            }

            const entries: [keyof T, StorageChange][] = [];

            for (const [fullKey, change] of Object.entries(changes)) {
                const logicalKey = this.decodeFullKey(fullKey);

                if (logicalKey !== null) {
                    entries.push([logicalKey, change]);
                }
            }

            if (entries.length === 0) {
                return;
            }

            queue.push(entries);
            void processQueue();
        };

        removeNativeListener = handleListener(storage().onChanged, listener);

        return dispose;
    }

    protected async formatChange<P extends T>(
        key: keyof P,
        changes: StorageChange
    ): Promise<{
        key: keyof P;
        newValue: P[keyof P] | undefined;
        oldValue: P[keyof P] | undefined;
    }> {
        return {
            key,
            newValue: changes.newValue as P[keyof P] | undefined,
            oldValue: changes.oldValue as P[keyof P] | undefined,
        };
    }

    protected toLogicalKey(key: keyof T): string {
        const logicalKey = key.toString();
        assertStorageKey(logicalKey);

        return logicalKey;
    }

    protected getLockKey<K extends keyof T>(key: K): string {
        return this.getFullKey(key);
    }

    private getUniqueKeys<K extends keyof T>(keys: readonly K[]): K[] {
        const uniqueKeys = new Map<string, K>();

        for (const key of keys) {
            const fullKey = this.getFullKey(key);

            if (!uniqueKeys.has(fullKey)) {
                uniqueKeys.set(fullKey, key);
            }
        }

        return [...uniqueKeys.values()];
    }

    private async requestLocks<R, K extends keyof T>(
        keys: readonly K[],
        task: () => Promise<R>,
        options?: StorageLockOptions
    ): Promise<R> {
        const lockNames = [...new Set(keys.map(key => this.getLockKey(key)))].sort();

        const requestNext = async (index: number): Promise<R> => {
            const lockName = lockNames[index];

            if (lockName === undefined) {
                return await task();
            }

            return await this.locker.request(lockName, async () => await requestNext(index + 1), options);
        };

        return await requestNext(0);
    }
}
