import {dequal as isEqual} from "dequal/lite";
import type {StorageLockOptions, StorageProvider, StorageState, StorageUpdater, StorageWatchOptions} from "../types";

export default class MonoStorage<T extends StorageState, K extends string> implements StorageProvider<T> {
    constructor(
        public readonly key: K,
        protected readonly storage: StorageProvider<Record<K, Partial<T>>>
    ) {
        if (!key || typeof key !== "string") {
            throw new Error("MonoStorage: 'key' must be a non-empty string");
        }
    }

    private async read(): Promise<Partial<T>> {
        const obj = await this.storage.get(this.key);

        return obj && typeof obj === "object" ? obj : {};
    }

    public async set<KP extends keyof T>(key: KP, value: T[KP]): Promise<void> {
        await this.update(key, () => value);
    }

    public async get<KP extends keyof T>(key: KP): Promise<T[KP] | undefined> {
        const bucket = await this.read();

        return bucket[key] as T[KP] | undefined;
    }

    public async update<KP extends keyof T>(
        key: KP,
        updater: StorageUpdater<T[KP]>,
        options?: StorageLockOptions
    ): Promise<T[KP] | undefined> {
        const nextBucket = await this.storage.update(
            this.key,
            async bucketValue => {
                const bucket: Partial<T> = bucketValue && typeof bucketValue === "object" ? bucketValue : {};
                const prevValue = bucket[key] as T[KP] | undefined;
                const nextValue = await updater(prevValue);

                if (nextValue === undefined) {
                    if (!(key in bucket)) {
                        return bucket;
                    }

                    const next = {...bucket};
                    delete next[key];

                    return Object.keys(next).length === 0 ? undefined : next;
                }

                return {...bucket, [key]: nextValue};
            },
            options
        );

        return nextBucket?.[key] as T[KP] | undefined;
    }

    public async getAll(): Promise<Partial<T>> {
        return await this.read();
    }

    public async remove<KP extends keyof T>(keys: KP | KP[], options?: StorageLockOptions): Promise<void> {
        const list = Array.isArray(keys) ? keys : [keys];

        await this.storage.update(
            this.key,
            bucketValue => {
                const bucket: Partial<T> = bucketValue && typeof bucketValue === "object" ? bucketValue : {};

                if (Object.keys(bucket).length === 0) {
                    return bucket;
                }

                const next = {...bucket};
                let changed = false;

                for (const currentKey of list) {
                    if (currentKey in next) {
                        delete next[currentKey];
                        changed = true;
                    }
                }

                if (!changed) {
                    return bucket;
                }

                return Object.keys(next).length === 0 ? undefined : next;
            },
            options
        );
    }

    public async clear(options?: StorageLockOptions): Promise<void> {
        await this.storage.remove(this.key, options);
    }

    public watch(options: StorageWatchOptions<T>): () => void {
        return this.storage.watch({
            [this.key]: (newValue: Partial<T> | undefined, oldValue: Partial<T> | undefined) => {
                const newObj: Partial<T> = newValue && typeof newValue === "object" ? newValue : {};
                const oldObj: Partial<T> = oldValue && typeof oldValue === "object" ? oldValue : {};

                const keys = new Set<string>([...Object.keys(oldObj), ...Object.keys(newObj)]);

                if (typeof options === "function") {
                    for (const key of keys) {
                        const newValueByKey = newObj[key];
                        const oldValueByKey = oldObj[key];

                        if (!isEqual(newValueByKey, oldValueByKey)) {
                            options(newValueByKey, oldValueByKey, key);
                        }
                    }

                    return;
                }

                for (const key of keys) {
                    const cb = options[key];

                    if (!cb) {
                        continue;
                    }

                    const n = (newObj as any)[key];
                    const o = (oldObj as any)[key];

                    if (!isEqual(n, o)) {
                        cb(n, o);
                    }
                }
            },
        } as unknown as StorageWatchOptions<Record<K, Partial<T>>>);
    }
}
