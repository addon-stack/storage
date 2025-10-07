import {dequal as isEqual} from "dequal/lite";
import type {StorageProvider, StorageState, StorageWatchOptions} from "../types";

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

    private async write(obj: Partial<T>): Promise<void> {
        await this.storage.set(this.key, obj);
    }

    public async set<KP extends keyof T>(key: KP, value: T[KP]): Promise<void> {
        const bucket = await this.read();

        if (value === undefined) {
            if (key in bucket) {
                const next = {...bucket};

                delete next[key];

                if (Object.keys(next).length === 0) {
                    await this.storage.remove(this.key);
                } else {
                    await this.write(next);
                }
            }

            return;
        }

        await this.write({...bucket, [key]: value});
    }

    public async get<KP extends keyof T>(key: KP): Promise<T[KP] | undefined> {
        const bucket = await this.read();

        return bucket[key] as T[KP] | undefined;
    }

    public async getAll(): Promise<Partial<T>> {
        return await this.read();
    }

    public async remove<KP extends keyof T>(keys: KP | KP[]): Promise<void> {
        const bucket = await this.read();

        const list = Array.isArray(keys) ? keys : [keys];

        if (Object.keys(bucket).length === 0) {
            return;
        }

        const next = {...bucket};

        let changed = false;

        for (const k of list) {
            if (k in next) {
                delete next[k];

                changed = true;
            }
        }

        if (!changed) {
            return;
        }

        if (Object.keys(next).length === 0) {
            await this.storage.remove(this.key);
        } else {
            await this.write(next);
        }
    }

    public async clear(): Promise<void> {
        await this.storage.remove(this.key);
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
