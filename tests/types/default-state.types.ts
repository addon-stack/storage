import {
    MonoStorage,
    SecureStorage,
    Storage,
    type StorageBatchSnapshot,
    type StorageBatchUpdateComparer,
    type StorageBatchUpdateOptions,
    type StorageBatchUpdater,
    type StorageChanges,
    StoragePartialUpdateError,
    type StorageProvider,
    type StorageState,
    type StorageSubscriber,
    type StorageWatchOptions,
} from "~";

type Equal<Left, Right> =
    (<Value>() => Value extends Left ? 1 : 2) extends <Value>() => Value extends Right ? 1 : 2 ? true : false;

type Expect<Value extends true> = Value;
type IsAny<Value> = 0 extends 1 & Value ? true : false;

const directStorage = new Storage();
const directSecureStorage = new SecureStorage();
const directMonoStorage = new MonoStorage("bucket", Storage.Local());

type DirectStorageDefault = Expect<Equal<typeof directStorage, Storage<StorageState>>>;
type DirectSecureStorageDefault = Expect<Equal<typeof directSecureStorage, SecureStorage<StorageState>>>;
type DirectMonoStorageDefault = Expect<Equal<typeof directMonoStorage, MonoStorage<StorageState, "bucket">>>;

const storageMake = Storage.make();
const storageLocal = Storage.Local();
const storageSession = Storage.Session();
const storageSync = Storage.Sync();
const storageManaged = Storage.Managed();
const storageMono = Storage.Local({key: "bucket"});

const secureMake = SecureStorage.make({secureKey: "AppSecret"});
const secureLocal = SecureStorage.Local({secureKey: "AppSecret"});
const secureSession = SecureStorage.Session({secureKey: "AppSecret"});
const secureSync = SecureStorage.Sync({secureKey: "AppSecret"});
const secureManaged = SecureStorage.Managed({secureKey: "AppSecret"});
const secureMono = SecureStorage.Local({key: "bucket", secureKey: "AppSecret"});

type StorageMakeDefault = Expect<Equal<typeof storageMake, StorageProvider<StorageState>>>;
type StorageLocalDefault = Expect<Equal<typeof storageLocal, StorageProvider<StorageState>>>;
type StorageSessionDefault = Expect<Equal<typeof storageSession, StorageProvider<StorageState>>>;
type StorageSyncDefault = Expect<Equal<typeof storageSync, StorageProvider<StorageState>>>;
type StorageManagedDefault = Expect<Equal<typeof storageManaged, StorageProvider<StorageState>>>;
type StorageMonoDefault = Expect<Equal<typeof storageMono, StorageProvider<StorageState>>>;
type SecureMakeDefault = Expect<Equal<typeof secureMake, StorageProvider<StorageState>>>;
type SecureLocalDefault = Expect<Equal<typeof secureLocal, StorageProvider<StorageState>>>;
type SecureSessionDefault = Expect<Equal<typeof secureSession, StorageProvider<StorageState>>>;
type SecureSyncDefault = Expect<Equal<typeof secureSync, StorageProvider<StorageState>>>;
type SecureManagedDefault = Expect<Equal<typeof secureManaged, StorageProvider<StorageState>>>;
type SecureMonoDefault = Expect<Equal<typeof secureMono, StorageProvider<StorageState>>>;

declare const providerTypeWithoutGeneric: StorageProvider;
declare const storageTypeWithoutGeneric: Storage;
declare const secureStorageTypeWithoutGeneric: SecureStorage;
declare const monoStorageTypeWithoutGeneric: MonoStorage;
declare const changesTypeWithoutGeneric: StorageChanges;
declare const subscriberTypeWithoutGeneric: StorageSubscriber;
declare const watcherTypeWithoutGeneric: StorageWatchOptions;
declare const batchSnapshotTypeWithoutGeneric: StorageBatchSnapshot;
declare const batchComparerTypeWithoutGeneric: StorageBatchUpdateComparer;
declare const batchUpdaterTypeWithoutGeneric: StorageBatchUpdater;
declare const batchOptionsTypeWithoutGeneric: StorageBatchUpdateOptions;
declare const partialUpdateErrorTypeWithoutGeneric: StoragePartialUpdateError;

void providerTypeWithoutGeneric;
void storageTypeWithoutGeneric;
void secureStorageTypeWithoutGeneric;
void monoStorageTypeWithoutGeneric;
void changesTypeWithoutGeneric;
void subscriberTypeWithoutGeneric;
void watcherTypeWithoutGeneric;
void batchSnapshotTypeWithoutGeneric;
void batchComparerTypeWithoutGeneric;
void batchUpdaterTypeWithoutGeneric;
void batchOptionsTypeWithoutGeneric;
void partialUpdateErrorTypeWithoutGeneric;

async function verifyLooseProvider() {
    const storage: StorageProvider = Storage.Local({namespace: "playground"});

    await storage.set("theme", "dark");
    await storage.set("attempts", 3);
    await storage.set("enabled", true);
    await storage.set("nullable", null);
    await storage.set("profile", {name: "Ada"});
    await storage.set("tags", ["browser", "extension"]);

    const value = await storage.get("theme");
    type LooseGetResult = Expect<IsAny<typeof value>>;

    void (null as unknown as LooseGetResult);
}

void verifyLooseProvider;

interface SettingsState {
    attempts?: number;
    nullable?: string | null;
    theme?: "light" | "dark";
}

const typedStorage = Storage.Local<SettingsState>();

async function verifyTypedProvider() {
    const theme = await typedStorage.get("theme");
    type TypedGetResult = Expect<Equal<typeof theme, "light" | "dark" | undefined>>;

    await typedStorage.set("theme", "dark");
    await typedStorage.set("nullable", null);

    // @ts-expect-error unknown keys remain rejected when a state contract is provided
    await typedStorage.get("unknown");
    // @ts-expect-error values remain tied to their keys in strict mode
    await typedStorage.set("attempts", "three");
    // @ts-expect-error undefined deletion remains limited to update/remove in strict mode
    await typedStorage.set("theme", undefined);

    void (null as unknown as TypedGetResult);
}

void verifyTypedProvider;

const bucketProvider = Storage.Local<Record<"bucket", Partial<SettingsState>>>();
const inferredMonoStorage = new MonoStorage("bucket", bucketProvider);

type InferredMonoStorage = Expect<Equal<typeof inferredMonoStorage, MonoStorage<SettingsState, "bucket">>>;

void (null as unknown as InferredMonoStorage);
