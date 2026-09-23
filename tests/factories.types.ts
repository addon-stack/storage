import {
    SecureStorage,
    type SecureStorageOptions,
    Storage,
    type StorageOptions,
    type StorageProvider,
} from "../src";

interface State {
    count?: number;
    theme?: "light" | "dark";
}

const session: StorageProvider<State> = Storage.Session<State>();

const secureMake: StorageProvider<State> = SecureStorage.make<State>({
    area: "local",
    namespace: "auth",
    secureKey: "AppSecret",
});

const secureLocal: StorageProvider<State> = SecureStorage.Local<State>({
    namespace: "auth",
    secureKey: "AppSecret",
});

const secureSession: StorageProvider<State> = SecureStorage.Session<State>({
    namespace: "auth",
    secureKey: "AppSecret",
});

const secureSync: StorageProvider<State> = SecureStorage.Sync<State>({
    namespace: "auth",
    secureKey: "AppSecret",
});

const secureManaged: StorageProvider<State> = SecureStorage.Managed<State>({
    namespace: "auth",
    secureKey: "AppSecret",
});

const storageOptions: StorageOptions = {
    area: "session",
    namespace: "settings",
};

const secureStorageOptions: SecureStorageOptions = {
    area: "sync",
    namespace: "auth",
    secureKey: "AppSecret",
};

const storageFromOptions = new Storage<State>(storageOptions);
const secureStorageFromOptions = new SecureStorage<State>(secureStorageOptions);

// @ts-expect-error area is selected by the Local shortcut
Storage.Local<State>({area: "sync"});
// @ts-expect-error area is selected by the Session shortcut
Storage.Session<State>({area: "local"});
// @ts-expect-error area is selected by the Sync shortcut
Storage.Sync<State>({area: "local"});
// @ts-expect-error area is selected by the Managed shortcut
Storage.Managed<State>({area: "local"});

// @ts-expect-error area is selected by the Local shortcut
SecureStorage.Local<State>({area: "sync", secureKey: "AppSecret"});
// @ts-expect-error area is selected by the Session shortcut
SecureStorage.Session<State>({area: "local", secureKey: "AppSecret"});
// @ts-expect-error area is selected by the Sync shortcut
SecureStorage.Sync<State>({area: "local", secureKey: "AppSecret"});
// @ts-expect-error area is selected by the Managed shortcut
SecureStorage.Managed<State>({area: "local", secureKey: "AppSecret"});

// @ts-expect-error secureKey is only supported by SecureStorage
Storage.Local<State>({secureKey: "AppSecret"});

void session;
void secureMake;
void secureLocal;
void secureSession;
void secureSync;
void secureManaged;
void storageFromOptions;
void secureStorageFromOptions;
