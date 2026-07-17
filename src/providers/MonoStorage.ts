import {dequal as isEqual} from "dequal/lite";
import {planBatchUpdate} from "../batch";
import {StorageCorruptionError} from "../errors";
import {
    assertStorageSetValue,
    copyRecord,
    copyRecordWithoutPrototype,
    createRecord,
    hasOwn,
    invokeCallback,
    isPlainObject,
    prepareStorageSetValues,
    scheduleUnhandledError,
    setRecordValue,
} from "../utils";
import {watchChanges} from "../watch";
import type {
    StorageBatchUpdateOptions,
    StorageBatchUpdater,
    StorageChanges,
    StorageLockOptions,
    StorageProvider,
    StorageSetValue,
    StorageState,
    StorageSubscriber,
    StorageUpdateOptions,
    StorageUpdater,
    StorageWatchOptions,
} from "../types";

/**
 * Bucket updaters return the received `bucketValue` when nothing changed and a
 * freshly built bucket otherwise, so reference identity — not deep equality —
 * decides whether the underlying provider writes. This is what lets a custom
 * per-field comparer force a physically identical write.
 */
const isUnchangedBucket = (previousBucket: unknown, nextBucket: unknown): boolean => previousBucket === nextBucket;

export default class MonoStorage<T extends StorageState, K extends string> implements StorageProvider<T> {
    constructor(
        public readonly key: K,
        protected readonly storage: StorageProvider<Record<K, Partial<T>>>
    ) {
        if (!key || typeof key !== "string") {
            throw new Error("MonoStorage: 'key' must be a non-empty string");
        }
    }

    private decodeBucket(value: unknown): Partial<T> {
        if (value === undefined) {
            return {};
        }

        if (!isPlainObject(value)) {
            throw new StorageCorruptionError(
                "MonoStorage",
                this.key,
                new TypeError("MonoStorage bucket must be a plain object.")
            );
        }

        return value as Partial<T>;
    }

    private async read(): Promise<Partial<T>> {
        return this.decodeBucket(await this.storage.get(this.key));
    }

    public set<KP extends keyof T>(key: KP, value: StorageSetValue<T[KP]>): Promise<void>;
    public set(values: Partial<T>): Promise<void>;
    public async set<KP extends keyof T>(
        ...args: [key: KP, value: StorageSetValue<T[KP]>] | [values: Partial<T>]
    ): Promise<void> {
        if (args.length === 1) {
            const values = prepareStorageSetValues<Partial<T>>(args[0]);
            await this.setBatch(values);
            return;
        }

        const [key, value] = args;
        assertStorageSetValue(value);

        const values = createRecord<Partial<T>>();
        setRecordValue(values, key, value);
        await this.setBatch(values);
    }

    private async setBatch(values: Partial<T>): Promise<void> {
        const keys = Object.keys(values) as (keyof T)[];

        if (keys.length === 0) {
            return;
        }

        await this.storage.update(
            this.key,
            bucketValue => {
                const nextBucket = copyRecord(this.decodeBucket(bucketValue));

                for (const currentKey of keys) {
                    setRecordValue(nextBucket, currentKey, values[currentKey]);
                }

                return nextBucket;
            },
            {compare: () => false}
        );
    }

    public get<KP extends keyof T>(key: KP): Promise<T[KP] | undefined>;
    public get<KP extends keyof T>(keys: readonly KP[]): Promise<Partial<Pick<T, KP>>>;
    public async get<KP extends keyof T>(
        keyOrKeys: KP | readonly KP[]
    ): Promise<T[KP] | undefined | Partial<Pick<T, KP>>> {
        if (Array.isArray(keyOrKeys)) {
            return await this.getBatch(keyOrKeys as readonly KP[]);
        }

        const bucket = await this.read();
        const key = keyOrKeys as KP;

        return hasOwn(bucket, key) ? (bucket[key] as T[KP]) : undefined;
    }

    private async getBatch<KP extends keyof T>(keys: readonly KP[]): Promise<Partial<Pick<T, KP>>> {
        const uniqueKeys = this.getUniqueKeys(keys);

        if (uniqueKeys.length === 0) {
            return {};
        }

        const bucket = await this.read();
        const values = createRecord<Partial<Pick<T, KP>>>();

        for (const currentKey of uniqueKeys) {
            if (hasOwn(bucket, currentKey)) {
                setRecordValue(values, currentKey, bucket[currentKey] as T[KP]);
            }
        }

        return values;
    }

    public update<KP extends keyof T>(
        key: KP,
        updater: StorageUpdater<T[KP]>,
        options?: StorageUpdateOptions<T[KP]>
    ): Promise<T[KP] | undefined>;
    public update<KP extends keyof T>(
        keys: readonly KP[],
        updater: StorageBatchUpdater<T, KP>,
        options?: StorageBatchUpdateOptions<T, KP>
    ): Promise<Partial<Pick<T, KP>>>;
    public async update<KP extends keyof T>(
        keyOrKeys: KP | readonly KP[],
        updater: StorageUpdater<T[KP]> | StorageBatchUpdater<T, KP>,
        options?: StorageUpdateOptions<T[KP]> | StorageBatchUpdateOptions<T, KP>
    ): Promise<T[KP] | undefined | Partial<Pick<T, KP>>> {
        if (Array.isArray(keyOrKeys)) {
            return await this.updateBatch(
                keyOrKeys as readonly KP[],
                updater as StorageBatchUpdater<T, KP>,
                options as StorageBatchUpdateOptions<T, KP> | undefined
            );
        }

        return await this.updateSingle(
            keyOrKeys as KP,
            updater as StorageUpdater<T[KP]>,
            options as StorageUpdateOptions<T[KP]> | undefined
        );
    }

    private async updateSingle<KP extends keyof T>(
        key: KP,
        updater: StorageUpdater<T[KP]>,
        options?: StorageUpdateOptions<T[KP]>
    ): Promise<T[KP] | undefined> {
        const {compare, ...lockOptions} = options ?? {};
        const compareValue = compare ?? isEqual;
        let result: T[KP] | undefined;

        await this.storage.update(
            this.key,
            async bucketValue => {
                const bucket = this.decodeBucket(bucketValue);
                const previousValue = hasOwn(bucket, key) ? (bucket[key] as T[KP]) : undefined;
                const nextValue = await updater(previousValue);

                result = nextValue;

                if (nextValue === undefined) {
                    if (!hasOwn(bucket, key)) {
                        return bucketValue;
                    }

                    const nextBucket = copyRecord(bucket);
                    delete nextBucket[key];

                    return Object.keys(nextBucket).length === 0 ? undefined : nextBucket;
                }

                if (compareValue(previousValue, nextValue)) {
                    return bucketValue;
                }

                const nextBucket = copyRecord(bucket);
                setRecordValue(nextBucket, key, nextValue);

                return nextBucket;
            },
            {...lockOptions, compare: isUnchangedBucket}
        );

        return result;
    }

    private async updateBatch<KP extends keyof T>(
        keys: readonly KP[],
        updater: StorageBatchUpdater<T, KP>,
        options?: StorageBatchUpdateOptions<T, KP>
    ): Promise<Partial<Pick<T, KP>>> {
        const uniqueKeys = this.getUniqueKeys(keys);

        if (uniqueKeys.length === 0) {
            return {};
        }

        const {compare, ...lockOptions} = options ?? {};
        let updatedValues = createRecord<Partial<Pick<T, KP>>>();

        await this.storage.update(
            this.key,
            async bucketValue => {
                const bucket = this.decodeBucket(bucketValue);
                const previousValues = createRecord<Partial<Pick<T, KP>>>();

                for (const currentKey of uniqueKeys) {
                    if (hasOwn(bucket, currentKey)) {
                        setRecordValue(previousValues, currentKey, bucket[currentKey] as T[KP]);
                    }
                }

                const patch = await updater(copyRecordWithoutPrototype(previousValues));
                const plan = planBatchUpdate(uniqueKeys, previousValues, patch, compare);
                updatedValues = plan.next;

                if (Object.keys(plan.valuesToSet).length === 0 && plan.keysToRemove.length === 0) {
                    return bucketValue;
                }

                const nextBucket = copyRecord(bucket);

                for (const currentKey of Object.keys(plan.valuesToSet) as KP[]) {
                    setRecordValue(nextBucket, currentKey, plan.valuesToSet[currentKey]);
                }

                for (const currentKey of plan.keysToRemove) {
                    delete nextBucket[currentKey];
                }

                return Object.keys(nextBucket).length === 0 ? undefined : nextBucket;
            },
            {...lockOptions, compare: isUnchangedBucket}
        );

        return updatedValues;
    }

    public async getAll(): Promise<Partial<T>> {
        return copyRecord(await this.read());
    }

    public async remove<KP extends keyof T>(keys: KP | KP[], options?: StorageLockOptions): Promise<void> {
        const list = this.getUniqueKeys(Array.isArray(keys) ? keys : [keys]);

        if (list.length === 0) {
            return;
        }

        await this.storage.update(
            this.key,
            bucketValue => {
                const bucket = this.decodeBucket(bucketValue);
                const nextBucket = copyRecord(bucket);
                let changed = false;

                for (const currentKey of list) {
                    if (hasOwn(nextBucket, currentKey)) {
                        delete nextBucket[currentKey];
                        changed = true;
                    }
                }

                if (!changed) {
                    return bucketValue;
                }

                return Object.keys(nextBucket).length === 0 ? undefined : nextBucket;
            },
            options
        );
    }

    public async clear(options?: StorageLockOptions): Promise<void> {
        await this.storage.remove(this.key, options);
    }

    public watch(watcher: StorageWatchOptions<T>): () => void {
        return watchChanges<T>(callback => this.subscribe(callback), watcher);
    }

    public subscribe(callback: StorageSubscriber<T>): () => void {
        let disposed = false;
        let unsubscribeStorage: () => void = () => undefined;

        const dispose = (): void => {
            if (disposed) {
                return;
            }

            disposed = true;
            unsubscribeStorage();
        };

        unsubscribeStorage = this.storage.subscribe(changes => {
            if (disposed || !hasOwn(changes, this.key)) {
                return;
            }

            const bucketChange = changes[this.key];

            if (!bucketChange) {
                return;
            }

            try {
                const newBucket = this.decodeBucket(bucketChange.newValue);
                const oldBucket = this.decodeBucket(bucketChange.oldValue);
                const logicalChanges = this.diffBuckets(newBucket, oldBucket);

                if (!disposed && Object.keys(logicalChanges).length > 0) {
                    invokeCallback(() => callback(logicalChanges));
                }
            } catch (error) {
                if (!disposed) {
                    dispose();
                    scheduleUnhandledError(error);
                }
            }
        });

        return dispose;
    }

    private diffBuckets(next: Partial<T>, previous: Partial<T>): StorageChanges<T> {
        const keys = new Set([...Object.keys(previous), ...Object.keys(next)]);
        const changes = createRecord<StorageChanges<T>>();

        for (const key of keys) {
            const newValue = hasOwn(next, key) ? next[key] : undefined;
            const oldValue = hasOwn(previous, key) ? previous[key] : undefined;

            if (isEqual(newValue, oldValue)) {
                continue;
            }

            setRecordValue(changes, key, {newValue, oldValue});
        }

        return changes;
    }

    private getUniqueKeys<KP extends keyof T>(keys: readonly KP[]): KP[] {
        const uniqueKeys = new Map<string, KP>();

        for (const currentKey of keys) {
            const normalizedKey = currentKey.toString();

            if (!uniqueKeys.has(normalizedKey)) {
                uniqueKeys.set(normalizedKey, currentKey);
            }
        }

        return [...uniqueKeys.values()];
    }
}
