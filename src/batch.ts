import {dequal as defaultCompare} from "dequal/lite";
import {copyRecord, copyRecordWithoutPrototype, createRecord, hasOwn, isPlainObject, setRecordValue} from "./utils";
import type {StorageBatchUpdateComparer, StorageState} from "./types";

export interface StorageBatchPlan<T extends StorageState, K extends keyof T> {
    next: Partial<Pick<T, K>>;
    valuesToSet: Partial<Pick<T, K>>;
    keysToRemove: K[];
}

export const planBatchUpdate = <T extends StorageState, K extends keyof T>(
    uniqueKeys: readonly K[],
    previous: Partial<Pick<T, K>>,
    patch: Partial<Pick<T, K>>,
    compare?: StorageBatchUpdateComparer<T, K>
): StorageBatchPlan<T, K> => {
    if (!isPlainObject(patch)) {
        throw new TypeError("Storage batch updater must return an object patch.");
    }

    const preparedPatch = copyRecord(patch);
    const allowedKeys = new Set(uniqueKeys.map(key => key.toString()));
    const invalidKey = Object.keys(preparedPatch).find(key => !allowedKeys.has(key));

    if (invalidKey !== undefined) {
        throw new Error(`Storage batch updater returned an unrequested key: "${invalidKey}".`);
    }

    const next = copyRecord(previous);
    const valuesToSet = createRecord<Partial<Pick<T, K>>>();
    const keysToRemove: K[] = [];

    for (const key of uniqueKeys) {
        if (!hasOwn(preparedPatch, key)) {
            continue;
        }

        const previousValue = hasOwn(previous, key) ? previous[key] : undefined;
        const nextValue = preparedPatch[key];

        if (nextValue === undefined) {
            delete next[key];

            if (hasOwn(previous, key)) {
                keysToRemove.push(key);
            }

            continue;
        }

        if (!compare && defaultCompare(previousValue, nextValue)) {
            continue;
        }

        setRecordValue(valuesToSet, key, nextValue);
        setRecordValue(next, key, nextValue);
    }

    if (compare?.(copyRecordWithoutPrototype(previous), copyRecordWithoutPrototype(next))) {
        return {
            next: copyRecord(previous),
            valuesToSet: createRecord<Partial<Pick<T, K>>>(),
            keysToRemove: [],
        };
    }

    return {next, valuesToSet, keysToRemove};
};
