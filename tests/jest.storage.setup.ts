import {TextDecoder, TextEncoder} from "util";

import "jest-webextension-mock";

import {flushMacrotask} from "./helpers/async";
import {createWebLocksMock} from "./helpers/web-locks";

type Listener = (changes: Record<string, chrome.storage.StorageChange>, areaName: chrome.storage.AreaName) => void;

const listeners = new Set<Listener>();

const hasOwn = (value: object, key: PropertyKey): boolean => Object.getOwnPropertyDescriptor(value, key) !== undefined;

const setRecordValue = (target: object, key: PropertyKey, value: unknown): void => {
    Object.defineProperty(target, key, {
        configurable: true,
        enumerable: true,
        value,
        writable: true,
    });
};

const createStorageArea = (): chrome.storage.StorageArea => {
    let data: Record<string, any> = {};

    const resolveGet = (keys: string | string[] | Record<string, any> | null | undefined) => {
        if (keys === null || keys === undefined) {
            return {...data};
        }

        if (typeof keys === "string") {
            return hasOwn(data, keys) ? {[keys]: data[keys]} : {};
        }

        if (Array.isArray(keys)) {
            return keys.reduce<Record<string, any>>((acc, key) => {
                if (hasOwn(data, key)) {
                    setRecordValue(acc, key, data[key]);
                }

                return acc;
            }, {});
        }

        return Object.entries(keys).reduce<Record<string, any>>((acc, [key, fallbackValue]) => {
            setRecordValue(acc, key, hasOwn(data, key) ? data[key] : fallbackValue);

            return acc;
        }, {});
    };

    const area = {
        get: jest.fn((keys?: any, callback?: (items: Record<string, any>) => void) => {
            const result = resolveGet(typeof keys === "function" ? null : keys);

            if (typeof keys === "function") {
                keys(result);

                return;
            }

            if (callback) {
                callback(result);

                return;
            }

            return Promise.resolve(result);
        }) as unknown as chrome.storage.StorageArea["get"],
        getBytesInUse: jest.fn((keys?: any, callback?: (bytesInUse: number) => void) => {
            if (typeof keys === "function") {
                keys(0);

                return;
            }

            if (callback) {
                callback(0);

                return;
            }

            return Promise.resolve(0);
        }) as unknown as chrome.storage.StorageArea["getBytesInUse"],
        set: jest.fn((items: Record<string, any>, callback?: () => void) => {
            const next = {...data};

            for (const [key, value] of Object.entries(items)) {
                if (value !== undefined) {
                    setRecordValue(next, key, value);
                }
            }

            data = next;

            if (callback) {
                callback();

                return;
            }

            return Promise.resolve();
        }) as unknown as chrome.storage.StorageArea["set"],
        remove: jest.fn((keys: string | string[], callback?: () => void) => {
            const list = Array.isArray(keys) ? keys : [keys];

            for (const key of list) {
                delete data[key];
            }

            if (callback) {
                callback();

                return;
            }

            return Promise.resolve();
        }) as unknown as chrome.storage.StorageArea["remove"],
        clear: jest.fn((callback?: () => void) => {
            data = {};

            if (callback) {
                callback();

                return;
            }

            return Promise.resolve();
        }) as unknown as chrome.storage.StorageArea["clear"],
        setAccessLevel: jest.fn((_accessLevel: any, callback?: () => void) => {
            if (callback) {
                callback();

                return;
            }

            return Promise.resolve();
        }) as unknown as chrome.storage.StorageArea["setAccessLevel"],
        getKeys: jest.fn((callback?: (keys: string[]) => void) => {
            const keys = Object.keys(data);

            if (callback) {
                callback(keys);

                return;
            }

            return Promise.resolve(keys);
        }) as unknown as chrome.storage.StorageArea["getKeys"],
        onChanged: {
            addListener: jest.fn(),
            removeListener: jest.fn(),
            hasListener: jest.fn(),
            hasListeners: jest.fn(),
        },
    } as unknown as chrome.storage.StorageArea & Record<string, any>;

    area.QUOTA_BYTES = Number.MAX_SAFE_INTEGER;
    area.MAX_ITEMS = Number.MAX_SAFE_INTEGER;
    area.MAX_WRITE_OPERATIONS_PER_HOUR = Number.MAX_SAFE_INTEGER;
    area.MAX_WRITE_OPERATIONS_PER_MINUTE = Number.MAX_SAFE_INTEGER;
    area.MAX_SUSTAINED_WRITE_OPERATIONS_PER_MINUTE = Number.MAX_SAFE_INTEGER;
    area.QUOTA_BYTES_PER_ITEM = Number.MAX_SAFE_INTEGER;

    return area;
};

Object.defineProperties(chrome.storage, {
    local: {value: createStorageArea() as chrome.storage.LocalStorageArea, writable: true, configurable: true},
    sync: {value: createStorageArea() as chrome.storage.SyncStorageArea, writable: true, configurable: true},
    managed: {value: createStorageArea(), writable: true, configurable: true},
    session: {value: createStorageArea() as chrome.storage.SessionStorageArea, writable: true, configurable: true},
});

chrome.storage.onChanged.addListener = jest.fn(cb => listeners.add(cb));
chrome.storage.onChanged.removeListener = jest.fn(cb => listeners.delete(cb));
chrome.storage.onChanged.hasListener = jest.fn(cb => listeners.has(cb));

global.resetStorageChangeListeners = () => {
    listeners.clear();
};

interface StorageChange {
    storage: object;
    key: string;
    oldValue: any;
    newValue: any;
    areaName?: chrome.storage.AreaName;
}

global.simulateStorageChange = ({storage, key, oldValue, newValue, areaName = "local"}: StorageChange) => {
    global.simulateStorageChanges({
        storage,
        changes: {[key]: {oldValue, newValue}},
        areaName,
    });
};

global.simulateStorageChanges = ({storage, changes, areaName = "local"}) => {
    const formattedChanges = Object.entries(changes).reduce<Record<string, chrome.storage.StorageChange>>(
        (acc, [key, change]) => {
            const fullKey = (storage as any)["getFullKey"](key);
            setRecordValue(acc, fullKey, change);

            return acc;
        },
        {}
    );

    listeners.forEach(listener => listener(formattedChanges, areaName));
};

global.simulateSecureStorageChange = async ({storage, key, oldValue, newValue, areaName}: StorageChange) => {
    await global.simulateSecureStorageChanges({
        storage,
        changes: {[key]: {oldValue, newValue}},
        areaName,
    });
};

global.simulateSecureStorageChanges = async ({storage, changes, areaName = "local"}) => {
    const encryptedChanges = Object.fromEntries(
        await Promise.all(
            Object.entries(changes).map(async ([key, {oldValue, newValue}]) => [
                key,
                {
                    oldValue: oldValue !== undefined ? await (storage as any)["encrypt"](oldValue) : undefined,
                    newValue: newValue !== undefined ? await (storage as any)["encrypt"](newValue) : undefined,
                },
            ] as const)
        )
    );

    global.simulateStorageChanges({storage, changes: encryptedChanges, areaName});

    await flushMacrotask();
};

// Needed to access a specific key in Storage
// Native GET method does not work correctly with a specific key other than "key"
// Pull Request with bug fix - https://github.com/RickyMarou/jest-webextension-mock/pull/19
global.storageLocalGet = (key: string | string[], storage?: object): Promise<any> => {
    const formatKey = (k: string) => (storage ? (storage as any)["getFullKey"](k) : k);

    return new Promise(resolve => {
        chrome.storage.local.get(null, res => {
            resolve(
                Array.isArray(key)
                    ? key.reduce(
                        (acc, k) => ({
                            ...acc,
                            [formatKey(k)]: (res as any)[formatKey(k)],
                        }),
                        {}
                    )
                    : (res as any)[formatKey(key)]
            );
        });
    });
};

global.TextEncoder = TextEncoder as any;
global.TextDecoder = TextDecoder as any;

export const cryptoMock = {
    subtle: {
        importKey: jest.fn(),
        deriveKey: jest.fn(),
        decrypt: jest.fn(),
        encrypt: jest.fn(),
        digest: jest.fn(),
    },
    getRandomValues: jest.fn(),
};

cryptoMock.subtle.importKey.mockImplementation((format, keyData, algorithm, extractable, keyUsages) => {
    return Promise.resolve({
        format,
        keyData,
        algorithm,
        extractable,
        keyUsages,
    });
});

cryptoMock.subtle.deriveKey.mockImplementation((algorithm, baseKey, derivedKeyAlgorithm, extractable, keyUsages) => {
    return Promise.resolve({
        algorithm,
        baseKey,
        derivedKeyAlgorithm,
        extractable,
        keyUsages,
    });
});

cryptoMock.subtle.decrypt.mockImplementation((_, __, data: ArrayBufferLike) => {
    return Promise.resolve(new Uint8Array(data));
});

cryptoMock.subtle.encrypt.mockImplementation((_, __, data: ArrayBufferLike) => {
    return Promise.resolve(new Uint8Array(data));
});

cryptoMock.subtle.digest.mockImplementation((_, __) => {
    return Promise.resolve(new Uint8Array([0x01, 0x02, 0x03, 0x04]));
});

cryptoMock.getRandomValues.mockImplementation((array: Array<any>) => {
    for (let i = 0; i < array.length; i++) {
        array[i] = Math.floor(Math.random() * 256);
    }

    return array;
});

// The globalThis does not define crypto by default
Object.defineProperty(globalThis, "crypto", {
    value: cryptoMock,
    writable: true,
    enumerable: true,
    configurable: true,
});

Object.defineProperty(globalThis.navigator, "locks", {
    value: createWebLocksMock(),
    writable: true,
    enumerable: true,
    configurable: true,
});
