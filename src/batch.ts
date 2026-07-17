import {dequal as defaultCompare} from "dequal/lite";
import {copyRecord, createRecord, hasOwn, isPlainObject, setRecordValue} from "./utils";
import type {StorageBatchUpdateOptions, StorageState} from "./types";

export interface StorageBatchPlan<T extends StorageState, K extends keyof T> {
    next: Partial<Pick<T, K>>;
    valuesToSet: Partial<Pick<T, K>>;
    keysToRemove: K[];
}

export const planBatchUpdate = <T extends StorageState, K extends keyof T>(
    uniqueKeys: readonly K[],
    previous: Partial<Pick<T, K>>,
    patch: Partial<Pick<T, K>>,
    compare?: StorageBatchUpdateOptions<T, K>["compare"]
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

        const compareValue = compare && hasOwn(compare, key) ? compare[key] : undefined;

        if ((compareValue ?? defaultCompare)(previousValue, nextValue)) {
            continue;
        }

        setRecordValue(valuesToSet, key, nextValue);
        setRecordValue(next, key, nextValue);
    }

    return {next, valuesToSet, keysToRemove};
};
