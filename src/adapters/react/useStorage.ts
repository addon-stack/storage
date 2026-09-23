import {dequal} from "dequal/lite";
import {useMemo, useSyncExternalStore} from "react";
import {StorageObserver} from "../../observer";
import {assertStorageKey, createRecord, hasOwn, isPlainObject, setRecordValue} from "../../utils";
import type {
    StorageBatchUpdater,
    StorageLockOptions,
    StorageState,
    StorageUpdateOptions,
    StorageUpdater,
} from "../../types";
import type {
    StorageKey,
    UseStorageBatchOptions,
    UseStorageBatchReturnValue,
    UseStorageOptions,
    UseStorageReturnValue,
    UseStorageSingleOptions,
} from "./types";

type SingleDisplay<Value, Default> = undefined extends Default ? Value | undefined : Exclude<Value, undefined>;
type Exact<Options, Shape> = Options & Record<Exclude<keyof Options, keyof Shape>, never>;
type ExactDefaults<Defaults, Key extends PropertyKey> = Defaults & Record<Exclude<keyof Defaults, Key>, never>;
type DefaultState<Key extends string, Defaults> = {
    [Property in Key]: Property extends keyof Defaults ? Defaults[Property] : unknown;
};

function useStorage<Value>(options: {
    storage?: never;
    key: string;
    keys?: never;
    defaultValue: Value;
}): UseStorageReturnValue<Value, Value>;

function useStorage<Value = unknown>(options: {
    storage?: never;
    key: string;
    keys?: never;
    defaultValue?: Value;
}): UseStorageReturnValue<Value>;

function useStorage<
    const Keys extends readonly string[],
    Defaults extends Partial<Record<Keys[number], unknown>>,
>(options: {
    storage?: never;
    key?: never;
    keys: Keys;
    defaultValue: ExactDefaults<Defaults, Keys[number]>;
}): UseStorageBatchReturnValue<DefaultState<Keys[number], Defaults>, Keys[number], Defaults>;

function useStorage<
    State extends StorageState = Record<string, unknown>,
    const Keys extends readonly StorageKey<State>[] = readonly StorageKey<State>[],
>(options: {
    storage?: never;
    key?: never;
    keys: Keys;
    defaultValue?: Partial<Pick<State, Keys[number]>>;
}): UseStorageBatchReturnValue<State, Keys[number]>;

function useStorage<
    State extends StorageState,
    const Key extends StorageKey<State> = StorageKey<State>,
    const Options extends UseStorageSingleOptions<State, Key> = UseStorageSingleOptions<State, Key>,
>(
    options: UseStorageSingleOptions<State, Key> & Exact<Options, UseStorageSingleOptions<State, Key>>
): UseStorageReturnValue<
    State[Key],
    SingleDisplay<State[Key], Options extends {defaultValue: infer Default} ? Default : undefined>
>;

function useStorage<
    State extends StorageState,
    const Keys extends readonly StorageKey<State>[] = readonly StorageKey<State>[],
    const Options extends UseStorageBatchOptions<State, Keys[number]> = UseStorageBatchOptions<State, Keys[number]>,
>(
    options: Omit<UseStorageBatchOptions<State, Keys[number]>, "defaultValue"> &
        Exact<Options, UseStorageBatchOptions<State, Keys[number]>> & {
            keys: Keys;
            defaultValue?: ExactDefaults<Options["defaultValue"], Keys[number]> & Partial<Pick<State, Keys[number]>>;
        }
): UseStorageBatchReturnValue<
    State,
    Keys[number],
    Options extends {defaultValue: infer Defaults} ? Defaults : undefined
>;

function useStorage<State extends StorageState, const Key extends StorageKey<State> = StorageKey<State>>(
    options: UseStorageOptions<State, Key>
): UseStorageReturnValue<State[Key]> | UseStorageBatchReturnValue<State, Key>;

function useStorage(
    options: UseStorageOptions
): UseStorageReturnValue<any> | UseStorageBatchReturnValue<StorageState, string> {
    if (!options || typeof options !== "object" || hasOwn(options, "key") === hasOwn(options, "keys")) {
        throw new TypeError("useStorage requires exactly one of key or keys.");
    }
    const single = hasOwn(options, "key");
    const requestedKeys = single ? [options.key] : options.keys;
    if (!Array.isArray(requestedKeys) || requestedKeys.some(key => typeof key !== "string")) {
        throw new TypeError("useStorage key must be a string and keys must be an array of strings.");
    }
    for (const key of requestedKeys as string[]) {
        assertStorageKey(key);
    }
    const selectionId = JSON.stringify([...new Set(requestedKeys)].sort());
    const keys = useMemo(() => JSON.parse(selectionId) as string[], [selectionId]);
    const observer = StorageObserver.get(options.storage);
    const scope = useMemo(() => observer.select(keys), [observer, keys]);
    const snapshot = useSyncExternalStore(scope.subscribe, scope.snapshot);

    const actions = useMemo(() => {
        const assertSelected = (values: unknown): void => {
            if (!isPlainObject(values)) {
                throw new TypeError("useStorage batch values must be an object patch.");
            }
            const extra = Object.keys(values).find(key => !keys.includes(key));
            if (extra !== undefined) {
                throw new TypeError(`useStorage received an unselected key: "${extra}".`);
            }
        };
        return {
            set: async (value: any) => {
                if (!single) {
                    assertSelected(value);
                }
                return await observer.mutate(keys, async provider => {
                    if (single) {
                        await provider.set(keys[0], value);
                    } else {
                        await provider.set(value);
                    }
                });
            },
            update: (updater: StorageUpdater<any> | StorageBatchUpdater, updateOptions?: StorageUpdateOptions<any>) =>
                observer.mutate(keys, async provider => {
                    if (single) {
                        return await provider.update(keys[0], updater as StorageUpdater<any>, updateOptions);
                    }
                    return await provider.update(
                        keys,
                        async previous => {
                            const patch = await (updater as StorageBatchUpdater)(previous);
                            assertSelected(patch);
                            return patch;
                        },
                        updateOptions
                    );
                }),
            remove: (lockOptions?: StorageLockOptions) =>
                observer.mutate(keys, provider => provider.remove(single ? keys[0] : keys, lockOptions)),
            refresh: () => observer.refresh(keys),
        };
    }, [observer, keys, single]);

    const defaults = options.defaultValue;
    if (!single && defaults !== undefined) {
        if (!isPlainObject(defaults) || Object.keys(defaults).some(key => !keys.includes(key))) {
            throw new TypeError("useStorage defaultValue must contain only selected keys.");
        }
    }
    const projectBatch = useMemo(() => {
        let previous: Record<string, unknown> | undefined;
        return (stored: Record<string, unknown>, fallback: Record<string, unknown> | undefined) => {
            const resolve = (key: string) =>
                hasOwn(stored, key) ? stored[key] : fallback && hasOwn(fallback, key) ? fallback[key] : undefined;
            const cached = previous;
            if (cached && keys.every(key => dequal(hasOwn(cached, key) ? cached[key] : undefined, resolve(key)))) {
                return cached;
            }
            const next = createRecord<Record<string, unknown>>();
            for (const key of keys) {
                const value = resolve(key);
                if (value !== undefined) {
                    setRecordValue(next, key, value);
                }
            }
            previous = next;
            return next;
        };
    }, [keys]);
    const value = single
        ? hasOwn(snapshot.value, keys[0])
            ? snapshot.value[keys[0]]
            : defaults
        : projectBatch(snapshot.value, defaults);

    return {
        ...actions,
        value,
        exists: single ? snapshot.exists[keys[0]] : snapshot.exists,
        status: snapshot.status,
        error: snapshot.error,
        isMutating: snapshot.isMutating,
        mutationError: snapshot.mutationError,
    };
}

export default useStorage;
