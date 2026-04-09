import {browser} from "@addon-core/browser";
import {callWithPromise, handleListener} from "@addon-core/browser/utils";
import LockManager from "../LockManager";
import MonoStorage from "./MonoStorage";
import type {
    StorageLocker,
    StorageLockOptions,
    StorageProvider,
    StorageState,
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

type FactoryOptions<T> = WithKey<CtorOptions<T>>;

type AreaOptions<T> = OmitUndef<FactoryOptions<T>, "area">;

type StaticMake<S extends StorageState, O extends StorageOptions> = <T extends new (options?: O) => StorageProvider<S>>(
    this: T,
    options?: FactoryOptions<T>
) => StorageProvider<S>;

export default abstract class AbstractStorage<T extends StorageState> implements StorageProvider<T> {
    private storage: StorageArea;
    private readonly area: AreaName;
    protected readonly locker: StorageLocker;
    protected readonly namespace?: string;
    protected separator: string = ":";

    public abstract clear(options?: StorageLockOptions): Promise<void>;

    protected abstract getFullKey(key: keyof T): string;

    protected abstract getNamespaceOfKey(key: string): string | undefined;

    protected abstract handleChange<P extends T>(
        key: string,
        changes: StorageChange,
        options: StorageWatchOptions<P>
    ): Promise<void>;

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
        O extends StorageOptions,
        T extends new (
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
        this.area = area ?? "local";
        this.storage = storage()[this.area];
        this.locker = locker ?? new LockManager(`storage:${this.area}`);
        this.namespace = namespace?.trim() ? namespace?.trim() : undefined;
    }

    public async set<K extends keyof T>(key: K, value: T[K]): Promise<void> {
        await this.setUnlocked(key, value);
    }

    public async update<K extends keyof T>(
        key: K,
        updater: StorageUpdater<T[K]>,
        options?: StorageLockOptions
    ): Promise<T[K] | undefined> {
        return await this.locker.request(
            this.getLockKey(key),
            async () => {
                const prev = await this.getUnlocked(key);
                const next = await updater(prev);

                if (next === undefined) {
                    await this.removeUnlocked(key);
                    return undefined;
                }

                await this.setUnlocked(key, next);

                return next;
            },
            options
        );
    }

    public async get<K extends keyof T>(key: K): Promise<T[K] | undefined> {
        return await this.getUnlocked(key);
    }

    public async getAll(): Promise<Partial<T>> {
        return await callWithPromise(resolve => {
            this.storage.get(null, result => {
                const formattedResult: Partial<Record<keyof T, T[keyof T]>> = {};

                for (const [key, value] of Object.entries(result)) {
                    if (this.isKeyValid(key)) {
                        const original = this.getOriginalKey(key) as keyof T;
                        formattedResult[original] = value as T[keyof T];
                    }
                }

                resolve(formattedResult as Partial<T>);
            });
        });
    }

    public async remove<K extends keyof T>(keys: K | K[], options?: StorageLockOptions): Promise<void> {
        const list = Array.isArray(keys) ? keys : [keys];

        for (const key of list) {
            await this.locker.request(
                this.getLockKey(key),
                async () => {
                    await this.removeUnlocked(key);
                },
                options
            );
        }
    }

    protected async setUnlocked<K extends keyof T>(key: K, value: T[K]): Promise<void> {
        return await callWithPromise<void>(resolve => {
            this.storage.set({[this.getFullKey(key)]: value}, () => {
                resolve();
            });
        });
    }

    protected async getUnlocked<K extends keyof T>(key: K): Promise<T[K] | undefined> {
        const fullKey = this.getFullKey(key);

        return await callWithPromise<T[K] | undefined>(resolve => {
            this.storage.get(fullKey, result => {
                resolve(result[fullKey]);
            });
        });
    }

    protected async removeUnlocked<K extends keyof T>(keys: K | K[]): Promise<void> {
        return await callWithPromise<void>(resolve => {
            const fullKeys = Array.isArray(keys) ? keys.map(key => this.getFullKey(key)) : this.getFullKey(keys);

            this.storage.remove(fullKeys, () => {
                resolve();
            });
        });
    }

    public watch<P extends T>(options: StorageWatchOptions<P>): () => void {
        const listener: onChangedListener = (changes: Record<string, StorageChange>, area: AreaName) => {
            if (area !== this.area) {
                return;
            }

            const entries = Object.entries(changes).reduce(
                (acc, [key, change]) => {
                    if (this.isKeyValid(key)) {
                        acc.push({key, task: this.handleChange(key, change, options)});
                    }

                    return acc;
                },
                [] as {key: string; task: Promise<void>}[]
            );

            Promise.allSettled(entries.map(e => e.task)).then(results => {
                results.forEach((result, i) => {
                    if (result.status === "rejected") {
                        const key = entries[i]?.key ?? "(unknown)";
                        const namespace = this.namespace ? ` with namespace "${this.namespace}"` : "";

                        console.error(
                            `Storage watch error: failed to handle change for key "${key}" in area "${this.area}"${namespace}:`,
                            result.reason
                        );
                    }
                });
            });
        };

        return handleListener(storage().onChanged, listener);
    }

    protected isKeyValid(key: string): boolean {
        return this.getNamespaceOfKey(key) === this.namespace;
    }

    protected async triggerChange<P extends T>(key: string, changes: StorageChange, options: StorageWatchOptions<P>) {
        const {newValue, oldValue} = changes;

        const originalKey = this.getOriginalKey(key);

        if (typeof options === "function") {
            options(newValue, oldValue, originalKey);
        } else if (options[originalKey]) {
            options[originalKey]?.(newValue, oldValue);
        }
    }

    protected getOriginalKey(key: string): keyof T {
        const fullKeyParts = key.split(this.separator);

        return fullKeyParts.length > 1 ? fullKeyParts[fullKeyParts.length - 1] : key;
    }

    protected getLockKey<K extends keyof T>(key: K): string {
        return this.getFullKey(key);
    }
}
