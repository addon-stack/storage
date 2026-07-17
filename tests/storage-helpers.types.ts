import * as storageApi from "../src";
import {
    storage,
    storageLocal,
    storageManaged,
    storageSecure,
    storageSession,
    storageSync,
    type SecureStorageHelperOptions,
    type StorageAreaHelperOptions,
    type StorageHelper,
    type StorageHelperOptions,
    type StorageProvider,
} from "../src";

type Equal<Left, Right> =
    (<Value>() => Value extends Left ? 1 : 2) extends <Value>() => Value extends Right ? 1 : 2 ? true : false;
type Expect<Value extends true> = Value;
type IsAny<Value> = 0 extends 1 & Value ? true : false;

interface SettingsState {
    attempts?: number;
    nullable?: string | null;
    theme?: "light" | "dark";
}

const defaultProvider = storageLocal();
const typedProvider = storageLocal<SettingsState>();
const configuredProvider = storageSync<SettingsState>({namespace: "settings"});
const genericAreaProvider = storage<SettingsState>({area: "session", namespace: "settings"});
const monoProvider = storageLocal<SettingsState>({key: "settings"});
const secureProvider = storageSecure<SettingsState>({
    area: "local",
    key: "settings",
    namespace: "auth",
    secureKey: "AppSecret",
});

type DefaultProvider = Expect<Equal<typeof defaultProvider, StorageProvider>>;
type TypedProvider = Expect<Equal<typeof typedProvider, StorageProvider<SettingsState>>>;
type ConfiguredProvider = Expect<Equal<typeof configuredProvider, StorageProvider<SettingsState>>>;
type GenericAreaProvider = Expect<Equal<typeof genericAreaProvider, StorageProvider<SettingsState>>>;
type MonoProvider = Expect<Equal<typeof monoProvider, StorageProvider<SettingsState>>>;
type SecureProvider = Expect<Equal<typeof secureProvider, StorageProvider<SettingsState>>>;

const looseValue = storageLocal("theme");
const typedValue = storageLocal<"light" | "dark">("theme");

type LooseValue = Expect<IsAny<Awaited<typeof looseValue>>>;
type TypedValue = Expect<Equal<Awaited<typeof typedValue>, "light" | "dark" | undefined>>;

void storageLocal<number>("attempts", 3);
void storageLocal<string | null>("nullable", null);

// @ts-expect-error explicit value generic rejects a different set value
void storageLocal<number>("attempts", "three");
// @ts-expect-error explicit value generic preserves the undefined set restriction
void storageLocal<string>("theme", undefined);

const looseBatch = storageLocal(["theme", "attempts"] as const);
const typedBatch = storageSync<{
    attempts?: number;
    theme?: "light" | "dark";
}>(["theme", "attempts"] as const);

type LooseBatch = Expect<
    Equal<Awaited<typeof looseBatch>, Partial<Record<"theme" | "attempts", any>>>
>;
type TypedBatch = Expect<
    Equal<
        Awaited<typeof typedBatch>,
        Partial<{attempts?: number; theme?: "light" | "dark"}>
    >
>;

const helper: StorageHelper<StorageAreaHelperOptions> = storageLocal;
const generalOptions: StorageHelperOptions = {area: "sync", key: "settings"};
const areaOptions: StorageAreaHelperOptions = {key: "settings", namespace: "feature"};
const secureOptions: SecureStorageHelperOptions = {
    area: "session",
    secureKey: "AppSecret",
};

storage(generalOptions);
storageLocal(areaOptions);
storageSecure(secureOptions);

storageSession();
storageManaged();

// @ts-expect-error area is selected by the area-specific helper
storageLocal<SettingsState>({area: "sync"});
// @ts-expect-error secureKey is supported only by storageSecure
storage<SettingsState>({secureKey: "AppSecret"});
// @ts-expect-error secure area-specific helper variants are intentionally not exported
storageApi.storageLocalSecure;

async function verifyStrictProvider() {
    const theme = await typedProvider.get("theme");
    type Theme = Expect<Equal<typeof theme, "light" | "dark" | undefined>>;

    await typedProvider.set("theme", "dark");

    // @ts-expect-error strict provider rejects unknown keys
    await typedProvider.get("unknown");
    // @ts-expect-error strict provider rejects values from another key
    await typedProvider.set("attempts", "three");

    void (null as unknown as Theme);
}

void verifyStrictProvider;
void helper;
void (null as unknown as DefaultProvider);
void (null as unknown as TypedProvider);
void (null as unknown as ConfiguredProvider);
void (null as unknown as GenericAreaProvider);
void (null as unknown as MonoProvider);
void (null as unknown as SecureProvider);
void (null as unknown as LooseValue);
void (null as unknown as TypedValue);
void (null as unknown as LooseBatch);
void (null as unknown as TypedBatch);
