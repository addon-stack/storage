import AbstractStorage, {type StorageOptions} from "./AbstractStorage";

import {STORAGE_KEY_SEPARATOR} from "../constants";

import type {StorageLockOptions, StorageState} from "../types";

export default class Storage<T extends StorageState = StorageState> extends AbstractStorage<T> {
    constructor(options: StorageOptions = {}) {
        super(options);
    }

    public async clear(options?: StorageLockOptions): Promise<void> {
        const allValues = await this.getAll();

        await this.remove(Object.keys(allValues), options);
    }

    protected getFullKey(key: keyof T): string {
        const logicalKey = this.toLogicalKey(key);

        return this.namespace ? `${this.namespace}${STORAGE_KEY_SEPARATOR}${logicalKey}` : logicalKey;
    }

    protected decodeFullKey(fullKey: string): keyof T | null {
        const parts = fullKey.split(STORAGE_KEY_SEPARATOR);

        if (this.namespace === undefined) {
            return parts.length === 1 ? (fullKey as keyof T) : null;
        }

        return parts.length === 2 && parts[0] === this.namespace ? (parts[1] as keyof T) : null;
    }
}
