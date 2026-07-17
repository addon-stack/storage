import {useCallback, useEffect, useMemo, useRef, useState} from "react";
import Storage from "../../providers/Storage";
import type {StorageProvider, StorageWatchOptions} from "../../types";

export type UseStorageProvider = Pick<StorageProvider<Record<string, any>>, "get" | "set" | "remove" | "watch">;

export interface UseStorageOptions<T> {
    key: string;
    storage?: UseStorageProvider;
    defaultValue?: T;
}

export type UseStorageReturnValue<T> = readonly [T | undefined, (value: T) => void, () => void];

function isOptions<T>(arg: any): arg is UseStorageOptions<T> {
    if (typeof arg === "object" && arg !== null && "key" in arg) {
        if (typeof arg.key !== "string") {
            throw new Error("Key must be a string");
        }
        return true;
    }
    return false;
}

function useStorage<T = any>(options: UseStorageOptions<T>): UseStorageReturnValue<T>;
function useStorage<T = any>(key: string, defaultValue?: T): UseStorageReturnValue<T>;
function useStorage<T = any>(arg1: string | UseStorageOptions<T>, arg2?: T): UseStorageReturnValue<T> {
    const options = isOptions<T>(arg1) ? arg1 : undefined;
    const key = options?.key ?? (arg1 as string);
    const storageRef = useRef<UseStorageProvider | null>(null);

    if (storageRef.current === null) {
        storageRef.current = options?.storage ?? Storage.Local<Record<string, any>>();
    }

    const storage = storageRef.current;
    const defaultValue = useMemo(() => (options ? options.defaultValue : arg2), [options, arg2]);

    const [value, setValue] = useState<T | undefined>(undefined);

    const fetchValue = useCallback((): void => {
        storage
            .get(key)
            .then(storedValue => setValue(storedValue ?? defaultValue))
            .catch(e => console.error("useStorage get storage value error", e));
    }, [key, defaultValue, storage]);

    useEffect(() => {
        fetchValue();

        const unsubscribe = storage.watch({
            [key]: (newValue: T | undefined) => setValue(newValue),
        } as unknown as StorageWatchOptions<Record<string, T>>);

        return () => unsubscribe();
    }, [key, fetchValue, storage]);

    const updateValue = useCallback(
        (newValue: T) => {
            const prevValue = value;
            setValue(newValue);
            storage.set(key, newValue).catch(e => {
                setValue(prevValue);
                console.error("Storage useStorage error - set storage value error", e);
            });
        },
        [key, value, storage]
    );

    const removeValue = useCallback(() => {
        storage
            .remove(key)
            .then(() => setValue(undefined))
            .catch(e => console.error("useStorage remove storage value error", e));
    }, [key, storage]);

    return [value, updateValue, removeValue] as const;
}

export default useStorage;
