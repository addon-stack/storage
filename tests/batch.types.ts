import type {
    MonoStorage,
    SecureStorage,
    Storage,
    StorageBatchSnapshot,
    StorageBatchUpdateComparer,
    StorageBatchUpdateOptions,
    StorageBatchUpdater,
    StorageChanges,
    StorageProvider,
    StorageSubscriber,
} from "../src";
import {useStorage, type UseStorageProvider} from "../src/adapters/react";

interface TypedState {
    count?: number;
    theme?: "light" | "dark";
    enabled?: boolean;
    nullable?: string | null;
}

declare const storage: StorageProvider<TypedState>;

type Equal<Left, Right> =
    (<Value>() => Value extends Left ? 1 : 2) extends <Value>() => Value extends Right ? 1 : 2 ? true : false;
type Expect<Value extends true> = Value;

async function verifyOverloadTypes() {
    const count = await storage.get("count");
    type SingleGetResult = Expect<Equal<typeof count, number | undefined>>;

    const keys = ["count", "theme"] as const;
    const values = await storage.get(keys);
    type BatchGetResult = Expect<Equal<typeof values, Partial<Pick<TypedState, "count" | "theme">>>>;

    values.count?.toFixed();
    values.theme?.toUpperCase();

    await storage.set("enabled", true);
    await storage.set("nullable", null);
    // @ts-expect-error undefined deletion is only supported by update/remove
    await storage.set("theme", undefined);
    await storage.set({count: 1, theme: "dark"});

    const nextTheme = await storage.update(
        "theme",
        async prev => prev ?? "light",
        {compare: (prev, next) => prev === next}
    );
    type SingleUpdateResult = Expect<Equal<typeof nextTheme, "light" | "dark" | undefined>>;

    const updated = await storage.update(
        ["count", "enabled"] as const,
        async prev => {
            type BatchUpdaterSnapshot = Expect<
                Equal<typeof prev, Partial<Pick<TypedState, "count" | "enabled">>>
            >;

            return {count: (prev.count ?? 0) + 1, enabled: prev.enabled ?? true};
        },
        {
            compare: (prev, next) => {
                type BatchComparePrev = Expect<
                    Equal<typeof prev, Readonly<Partial<Pick<TypedState, "count" | "enabled">>>>
                >;
                type BatchCompareNext = Expect<
                    Equal<typeof next, Readonly<Partial<Pick<TypedState, "count" | "enabled">>>>
                >;

                // @ts-expect-error aggregate comparer snapshots are readonly
                prev.count = 1;

                return prev.count === next.count && prev.enabled === next.enabled;
            },
        }
    );
    type BatchUpdateResult = Expect<Equal<typeof updated, Partial<Pick<TypedState, "count" | "enabled">>>>;

    updated.count?.toFixed();
    updated.enabled?.valueOf();

    const subscriber: StorageSubscriber<TypedState> = changes => {
        changes.count?.newValue?.toFixed();
        changes.theme?.oldValue?.toUpperCase();
    };
    const unsubscribe = storage.subscribe(changes => {
        type SubscriberChanges = Expect<Equal<typeof changes, StorageChanges<TypedState>>>;

        subscriber(changes);
    });
    type UnsubscribeResult = Expect<Equal<typeof unsubscribe, () => void>>;
    unsubscribe();

    const unwatch = storage.watch({
        count(next, prev) {
            type WatchNext = Expect<Equal<typeof next, number | undefined>>;
            type WatchPrev = Expect<Equal<typeof prev, number | undefined>>;
        },
        theme(next, prev) {
            type WatchNext = Expect<Equal<typeof next, "light" | "dark" | undefined>>;
            type WatchPrev = Expect<Equal<typeof prev, "light" | "dark" | undefined>>;
        },
    });
    type UnwatchResult = Expect<Equal<typeof unwatch, () => void>>;
    unwatch();

    const batchUpdater: StorageBatchUpdater<TypedState, "count" | "enabled"> = prev => ({
        count: prev.count,
    });
    type BatchSnapshot = Expect<
        Equal<
            StorageBatchSnapshot<TypedState, "count" | "enabled">,
            Readonly<Partial<Pick<TypedState, "count" | "enabled">>>
        >
    >;
    const batchComparer: StorageBatchUpdateComparer<TypedState, "count" | "enabled"> = (prev, next) =>
        prev.count === next.count && prev.enabled === next.enabled;
    const batchOptions: StorageBatchUpdateOptions<TypedState, "count" | "enabled"> = {
        compare: batchComparer,
    };
    await storage.update(["count", "enabled"] as const, batchUpdater, batchOptions);

    void (null as unknown as BatchSnapshot);

    const invalidBatchOptions: StorageBatchUpdateOptions<TypedState, "count" | "enabled"> = {
        compare: {
            // @ts-expect-error batch compare is one aggregate function, not a per-key comparer map
            count: (prev: number | undefined, next: number | undefined) => prev === next,
        },
    };
    void invalidBatchOptions;

    // @ts-expect-error unknown single storage key
    await storage.get("unknown");

    // @ts-expect-error unknown batch storage key
    await storage.get(["count", "unknown"] as const);

    // @ts-expect-error invalid value for the single-key overload
    await storage.set("theme", "blue");

    // @ts-expect-error invalid value for the object overload
    await storage.set({theme: "blue"});

    // @ts-expect-error unknown key in the object overload
    await storage.set({unknown: true});

    // @ts-expect-error batch updater patch value does not match the selected key
    await storage.update(["count"] as const, () => ({count: "one"}));

    // @ts-expect-error batch updater patch contains a key outside the selected tuple
    await storage.update(["count"] as const, () => ({theme: "dark"}));

    // @ts-expect-error removed API
    storage.getMany(["count"] as const);

    // @ts-expect-error removed API
    storage.setMany({count: 1});

    // @ts-expect-error removed API
    storage.updateMany(["count"] as const, () => ({count: 1}));

    // @ts-expect-error removed API
    storage.watchMany(() => undefined);
}

void verifyOverloadTypes;

async function saveDefinedValue<State extends Record<string, any>, Key extends keyof State>(
    provider: StorageProvider<State>,
    key: Key,
    value: State[Key]
) {
    if (value !== undefined) {
        await provider.set(key, value);
    }
}

void saveDefinedValue;

declare const concreteStorage: Storage<TypedState>;
declare const concreteSecureStorage: SecureStorage<TypedState>;
declare const concreteMonoStorage: MonoStorage<TypedState, "bucket">;

async function verifyConcreteSetTypes() {
    await concreteStorage.set("nullable", null);
    await concreteSecureStorage.set("nullable", null);
    await concreteMonoStorage.set("nullable", null);

    // @ts-expect-error undefined deletion is only supported by update/remove
    await concreteStorage.set("theme", undefined);
    // @ts-expect-error undefined deletion is only supported by update/remove
    await concreteSecureStorage.set("theme", undefined);
    // @ts-expect-error undefined deletion is only supported by update/remove
    await concreteMonoStorage.set("theme", undefined);
}

void verifyConcreteSetTypes;

function verifyReactAdapterCompatibility() {
    const provider: UseStorageProvider = storage;

    useStorage<"light" | "dark">({
        key: "theme",
        storage: provider,
        defaultValue: "light",
    });
}

void verifyReactAdapterCompatibility;
