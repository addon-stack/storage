import {SecureStorage, type SecureStorageOptions, Storage, type StorageOptions} from "../providers";
import {isPlainObject} from "../utils";

import type {StorageHelper, StorageProvider, StorageState} from "../types";

type StorageProviderFactory<Options extends object> = <State extends StorageState = StorageState>(
    options?: Options
) => StorageProvider<State>;

export type StorageHelperOptions = StorageOptions & {key?: string};

export type StorageAreaHelperOptions = Omit<StorageHelperOptions, "area">;

export type SecureStorageHelperOptions = SecureStorageOptions & {key?: string};

const storageOptionKeys = ["area", "key", "locker", "namespace"] as const;
const storageAreaOptionKeys = ["key", "locker", "namespace"] as const;
const secureStorageOptionKeys = ["area", "key", "locker", "namespace", "secureKey"] as const;

const assertOptions = (
    helperName: string,
    options: Record<string, unknown>,
    allowedOptionKeys: ReadonlySet<string>
): void => {
    const invalidKey = Object.keys(options).find(key => !allowedOptionKeys.has(key));

    if (invalidKey !== undefined) {
        throw new TypeError(`${helperName} options contain an unsupported property "${invalidKey}".`);
    }
};

function assertBatchKeys(helperName: string, keys: readonly unknown[]): asserts keys is readonly string[] {
    if (keys.some(key => typeof key !== "string")) {
        throw new TypeError(`${helperName} batch get keys must be strings.`);
    }
}

function assertSetKey(helperName: string, key: unknown): asserts key is string {
    if (typeof key !== "string") {
        throw new TypeError(`${helperName} set key must be a string.`);
    }
}

const createHelper = <Options extends object>(
    helperName: string,
    allowedOptionKeys: readonly string[],
    createProvider: StorageProviderFactory<Options>
): StorageHelper<Options> => {
    const allowedKeys = new Set(allowedOptionKeys);

    const helper = (...args: unknown[]): unknown => {
        if (args.length === 0 || (args.length === 1 && args[0] === undefined)) {
            return createProvider();
        }

        if (args.length === 1) {
            const [argument] = args;

            if (typeof argument === "string") {
                return createProvider().get(argument);
            }

            if (Array.isArray(argument)) {
                assertBatchKeys(helperName, argument);

                return createProvider().get(argument);
            }

            if (isPlainObject(argument)) {
                assertOptions(helperName, argument, allowedKeys);

                return createProvider(argument as Options);
            }

            throw new TypeError(`${helperName} expects options, a string key, or an array of string keys.`);
        }

        if (args.length === 2) {
            const [key, value] = args;

            assertSetKey(helperName, key);

            return createProvider().set(key, value);
        }

        throw new TypeError(`${helperName} expects zero, one, or two arguments.`);
    };

    return helper as StorageHelper<Options>;
};

export const storage: StorageHelper<StorageHelperOptions> = createHelper(
    "storage",
    storageOptionKeys,
    <State extends StorageState = StorageState>(options?: StorageHelperOptions): StorageProvider<State> =>
        Storage.make<State>(options)
);

export const storageLocal: StorageHelper<StorageAreaHelperOptions> = createHelper(
    "storageLocal",
    storageAreaOptionKeys,
    <State extends StorageState = StorageState>(options?: StorageAreaHelperOptions): StorageProvider<State> =>
        Storage.Local<State>(options)
);

export const storageSession: StorageHelper<StorageAreaHelperOptions> = createHelper(
    "storageSession",
    storageAreaOptionKeys,
    <State extends StorageState = StorageState>(options?: StorageAreaHelperOptions): StorageProvider<State> =>
        Storage.Session<State>(options)
);

export const storageSync: StorageHelper<StorageAreaHelperOptions> = createHelper(
    "storageSync",
    storageAreaOptionKeys,
    <State extends StorageState = StorageState>(options?: StorageAreaHelperOptions): StorageProvider<State> =>
        Storage.Sync<State>(options)
);

export const storageManaged: StorageHelper<StorageAreaHelperOptions> = createHelper(
    "storageManaged",
    storageAreaOptionKeys,
    <State extends StorageState = StorageState>(options?: StorageAreaHelperOptions): StorageProvider<State> =>
        Storage.Managed<State>(options)
);

export const storageSecure: StorageHelper<SecureStorageHelperOptions> = createHelper(
    "storageSecure",
    secureStorageOptionKeys,
    <State extends StorageState = StorageState>(options?: SecureStorageHelperOptions): StorageProvider<State> =>
        SecureStorage.make<State>(options)
);
