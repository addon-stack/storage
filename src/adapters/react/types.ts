import type {StorageObserverDriver, StorageStatus} from "../../observer/types";
import type {
    StorageBatchUpdateOptions,
    StorageBatchUpdater,
    StorageLockOptions,
    StorageSetValue,
    StorageState,
    StorageUpdateOptions,
    StorageUpdater,
} from "../../types";

export type UseStorageProvider<State extends StorageState = StorageState> = StorageObserverDriver<State>;

export type StorageKey<State> = keyof State & string;

export interface UseStorageState {
    readonly status: StorageStatus;
    readonly error: unknown;
    readonly isMutating: boolean;
    readonly mutationError: unknown;
    refresh(): Promise<void>;
}

export interface UseStorageSingleOptions<
    State extends StorageState,
    Key extends StorageKey<State> = StorageKey<State>,
> {
    storage?: UseStorageProvider<State>;
    key: Key;
    keys?: never;
    defaultValue?: State[Key];
}

export interface UseStorageBatchOptions<State extends StorageState, Key extends StorageKey<State> = StorageKey<State>> {
    storage?: UseStorageProvider<State>;
    key?: never;
    keys: readonly Key[];
    defaultValue?: Partial<Pick<State, Key>>;
}

export type UseStorageOptions<
    State extends StorageState = StorageState,
    Key extends StorageKey<State> = StorageKey<State>,
> = UseStorageSingleOptions<State, Key> | UseStorageBatchOptions<State, Key>;

export interface UseStorageReturnValue<Value, DisplayValue = Value | undefined> extends UseStorageState {
    readonly value: DisplayValue;
    readonly exists: boolean | undefined;
    set(value: StorageSetValue<Value>): Promise<void>;
    update(updater: StorageUpdater<Value>, options?: StorageUpdateOptions<Value>): Promise<Value | undefined>;
    remove(options?: StorageLockOptions): Promise<void>;
}

type DefinedKeys<Defaults> = {
    [Key in keyof Defaults]-?: undefined extends Defaults[Key] ? never : Key;
}[keyof Defaults];

export type UseStorageBatchValue<State, Key extends keyof State, Defaults = undefined> = Partial<Pick<State, Key>> & {
    [Property in Extract<Key, DefinedKeys<Defaults>>]-?: Exclude<State[Property], undefined>;
};

export interface UseStorageBatchReturnValue<
    State extends StorageState,
    Key extends StorageKey<State>,
    Defaults = undefined,
> extends UseStorageState {
    readonly value: UseStorageBatchValue<State, Key, Defaults>;
    readonly exists: Readonly<Record<Key, boolean | undefined>>;
    set<Patch extends Partial<Pick<State, Key>>>(
        values: Patch & {[Property in keyof Patch]: Property extends Key ? StorageSetValue<State[Property]> : never}
    ): Promise<void>;
    update<Updater extends StorageBatchUpdater<State, Key>>(
        updater: Updater & (Exclude<keyof Awaited<ReturnType<Updater>>, Key> extends never ? unknown : never),
        options?: StorageBatchUpdateOptions<State, Key>
    ): Promise<Partial<Pick<State, Key>>>;
    remove(options?: StorageLockOptions): Promise<void>;
}
