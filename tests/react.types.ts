import {storageLocal, StorageStatus, type StorageUpdateOptions} from "../src";
import {useStorage} from "../src/adapters/react";

type State = {theme?: "light" | "dark"; count: number; nullable: string | null; language: "ru" | "en"};
const storage = storageLocal<State>();
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
type Expect<T extends true> = T;

function verifyReactTypes() {
    const theme = useStorage({storage, key: "theme"});
    const themeWithDefault = useStorage({storage, key: "theme", defaultValue: "light"});
    const batch = useStorage({storage, keys: ["theme", "count"], defaultValue: {theme: "light"}});
    const noDefaults = useStorage({storage, keys: ["theme", "count"]});
    const allDefaults = useStorage({storage, keys: ["theme", "count"], defaultValue: {theme: "light", count: 0}});
    const nullable = useStorage({storage, key: "nullable", defaultValue: "fallback"});
    const raw = useStorage<number>({key: "count"});
    const inferred = useStorage({key: "theme", defaultValue: "light"});
    const localBatch = useStorage({keys: ["a", "b"]});

    const proofs: [
        Expect<Equal<typeof theme.value, "light" | "dark" | undefined>>,
        Expect<Equal<typeof themeWithDefault.value, "light" | "dark">>,
        Expect<Equal<typeof batch.value.theme, "light" | "dark">>,
        Expect<Equal<typeof batch.value.count, number | undefined>>,
        Expect<Equal<typeof noDefaults.value.count, number | undefined>>,
        Expect<Equal<typeof allDefaults.value.count, number>>,
        Expect<Equal<typeof nullable.value, string | null>>,
        Expect<Equal<typeof raw.value, number | undefined>>,
        Expect<Equal<typeof inferred.value, string>>,
        Expect<Equal<typeof localBatch.exists.a, boolean | undefined>>,
    ] = [true, true, true, true, true, true, true, true, true, true];

    void proofs;
    const statusProof: Expect<Equal<typeof theme.status, StorageStatus>> = true;
    const textProof: Expect<Equal<`${StorageStatus}`, "loading" | "ready" | "error">> = true;
    const status: StorageStatus = StorageStatus.Loading;
    const textStatus: `${StorageStatus}` = status;
    const readyText: `${StorageStatus}` = "ready";
    void [statusProof, textProof, textStatus, readyText];
    void theme.set("dark");
    void batch.set({count: 3});
    void batch.update(previous => ({count: (previous.count ?? 0) + 1, theme: undefined}));
    void theme.update(previous => previous ?? "dark", {timeout: 1} satisfies StorageUpdateOptions<State["theme"]>);
    void theme.remove({signal: new AbortController().signal});
    // @ts-expect-error key and keys are mutually exclusive
    useStorage({storage, key: "theme", keys: ["theme"]});
    // @ts-expect-error a selection is required
    useStorage({storage});
    // @ts-expect-error unknown key must not widen the inferred schema
    useStorage({storage, key: "unknown"});
    // @ts-expect-error unknown batch key
    useStorage({storage, keys: ["theme", "unknown"]});
    // @ts-expect-error single options reject misspelled defaultValue with a provider
    useStorage({storage, key: "theme", defaultValues: "light"});
    // @ts-expect-error batch options reject misspelled defaultValue with a provider
    useStorage({storage, keys: ["theme"], defaultValues: {theme: "light"}});
    // @ts-expect-error single options reject misspelled defaultValue without a provider
    useStorage({key: "theme", defaultValues: "light"});
    // @ts-expect-error batch options reject misspelled defaultValue without a provider
    useStorage({keys: ["theme"], defaultValues: {theme: "light"}});
    // @ts-expect-error default must not widen the inferred schema
    useStorage({storage, key: "theme", defaultValue: "blue"});
    // @ts-expect-error wrong batch default
    useStorage({storage, keys: ["count"], defaultValue: {count: "one"}});
    // @ts-expect-error defaults are limited to the selection
    useStorage({storage, keys: ["theme"], defaultValue: {theme: "light", count: 2}});
    // @ts-expect-error unknown value
    themeWithDefault.set("blue");
    // @ts-expect-error use remove/update to delete
    theme.set(undefined);
    // @ts-expect-error unselected value
    batch.value.language;
    // @ts-expect-error unselected exists
    batch.exists.language;
    // @ts-expect-error wrong value type
    batch.set({count: "one"});
    // @ts-expect-error unselected mutation
    batch.set({language: "ru"});
    // @ts-expect-error unselected properties alongside selected properties
    batch.set({theme: "dark", language: "ru"});
    // @ts-expect-error batch set does not accept deletion
    batch.set({theme: undefined});
    // @ts-expect-error wrong updater result
    batch.update(() => ({count: "one"}));
    // @ts-expect-error updater patch cannot contain only unselected properties
    batch.update(() => ({language: "ru"}));
    // @ts-expect-error mixed updater patch cannot escape the selected keys
    batch.update(() => ({count: 1, language: "ru"}));
    // @ts-expect-error no tuple API
    theme[0];
    // @ts-expect-error no positional API
    useStorage("theme", "light");
}

void verifyReactTypes;

// Public option types must be usable as parameters of forwarding hooks.
function useSingleOptions(options: import("../src/adapters/react").UseStorageSingleOptions<State, "theme">) {
    const result = useStorage(options);
    const proof: Expect<Equal<typeof result.value, State["theme"] | undefined>> = true;
    void proof;

    return result;
}

function useBatchOptions(options: import("../src/adapters/react").UseStorageBatchOptions<State, "theme" | "count">) {
    const result = useStorage(options);
    const proof: Expect<Equal<typeof result.value.count, number | undefined>> = true;
    void proof;
    // @ts-expect-error a forwarding batch hook still cannot write unselected fields
    void result.set({language: "ru"});

    return result;
}

function useDynamicOptions(options: import("../src/adapters/react").UseStorageOptions<State, "theme">) {
    const result = useStorage(options);

    const proof: Expect<Equal<typeof result,
        import("../src/adapters/react").UseStorageReturnValue<State["theme"]> |
        import("../src/adapters/react").UseStorageBatchReturnValue<State, "theme">
    >> = true;

    void proof;

    return result;
}

function verifyPreparedOptions() {
    const single = {key: "theme", storage, defaultValue: "light" as const} satisfies import("../src/adapters/react").UseStorageSingleOptions<State>;
    const batch = {keys: ["theme", "count"] as const, storage} satisfies import("../src/adapters/react").UseStorageBatchOptions<State>;
    const one = useStorage(single);
    const many = useStorage(batch);
    const optionalDefault: {key: string; defaultValue?: string} = {key: "theme"};
    const local = useStorage(optionalDefault);
    const explicitSingle = useStorage<State, "theme">({key: "theme"});
    const explicitBatch = useStorage<State, readonly ["theme"]>({keys: ["theme"]});
    const inferredBatch = useStorage({keys: ["theme", "count"], defaultValue: {theme: "light", count: 0}});

    const proofs: [
        Expect<Equal<typeof one.value, "light" | "dark">>,
        Expect<Equal<typeof many.value.count, number | undefined>>,
        Expect<Equal<typeof local.value, string | undefined>>,
        Expect<Equal<typeof explicitSingle.value, State["theme"] | undefined>>,
        Expect<Equal<typeof explicitBatch.value.theme, State["theme"] | undefined>>,
        Expect<Equal<typeof inferredBatch.value.theme, string>>,
        Expect<Equal<typeof inferredBatch.value.count, number>>,
    ] = [true, true, true, true, true, true, true];

    void proofs;
    // @ts-expect-error explicit schema single defaults must not widen the schema
    useStorage<State, "theme">({key: "theme", defaultValue: "blue"});
    // @ts-expect-error explicit schema batch defaults must not widen the schema
    useStorage<State, readonly ["theme"]>({keys: ["theme"], defaultValue: {theme: "blue"}});
    // @ts-expect-error local defaults cannot add unselected properties
    useStorage({keys: ["theme"], defaultValue: {theme: "light", count: 0}});
}

void useSingleOptions;
void useBatchOptions;
void useDynamicOptions;
void verifyPreparedOptions;

function verifyOptionalDefaults(
    single: {storage: typeof storage; key: "theme"; defaultValue?: "light"},
    batch: {storage: typeof storage; keys: readonly ["theme", "count"]; defaultValue?: {theme: "light"; count: number}}
) {
    const one = useStorage(single);
    const many = useStorage(batch);

    const proofs: [
        Expect<Equal<typeof one.value, State["theme"] | undefined>>,
        Expect<Equal<typeof many.value.count, number | undefined>>,
    ] = [true, true];

    void proofs;
    useStorage<State, "theme">({key: "theme", defaultValue: "light"});
    useStorage<State, readonly ["theme"]>({keys: ["theme"], defaultValue: {theme: "light"}});
}

function useGenericSingle<S extends Record<string, unknown>, K extends keyof S & string>(
    options: import("../src/adapters/react").UseStorageSingleOptions<S, K>
) {
    const result = useStorage(options);
    const value: S[K] | undefined = result.value;

    return value;
}

void verifyOptionalDefaults;
void useGenericSingle;
