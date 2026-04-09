import "jest-webextension-mock";
import {TextDecoder, TextEncoder} from "util";

import type {StorageProvider, StorageState} from "../src";

type Listener = (changes: Record<string, chrome.storage.StorageChange>, areaName: chrome.storage.AreaName) => void;

const listeners = new Set<Listener>();

const createStorageArea = (): chrome.storage.StorageArea => {
    let data: Record<string, any> = {};

    const resolveGet = (keys: string | string[] | Record<string, any> | null | undefined) => {
        if (keys === null || keys === undefined) {
            return {...data};
        }

        if (typeof keys === "string") {
            return {[keys]: data[keys]};
        }

        if (Array.isArray(keys)) {
            return keys.reduce<Record<string, any>>((acc, key) => {
                acc[key] = data[key];
                return acc;
            }, {});
        }

        return Object.entries(keys).reduce<Record<string, any>>((acc, [key, fallbackValue]) => {
            acc[key] = key in data ? data[key] : fallbackValue;
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
            data = {...data, ...items};

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

chrome.storage.local = createStorageArea() as chrome.storage.LocalStorageArea;
chrome.storage.sync = createStorageArea() as chrome.storage.SyncStorageArea;
chrome.storage.managed = createStorageArea();
chrome.storage.session = createStorageArea() as chrome.storage.SessionStorageArea;

chrome.storage.onChanged.addListener = jest.fn(cb => listeners.add(cb));
chrome.storage.onChanged.removeListener = jest.fn(cb => listeners.delete(cb));
chrome.storage.onChanged.hasListener = jest.fn(cb => listeners.has(cb));

interface StorageChange {
    storage: StorageProvider<StorageState>;
    key: string;
    oldValue: any;
    newValue: any;
    areaName?: chrome.storage.AreaName;
}

global.simulateStorageChange = ({storage, key, oldValue, newValue, areaName = "local"}: StorageChange) => {
    const fullKey = (storage as any)["getFullKey"](key);

    const changes = {[fullKey]: {oldValue, newValue}};

    listeners.forEach(listener => listener(changes, areaName));
};

global.simulateSecureStorageChange = async ({storage, key, oldValue, newValue, areaName}: StorageChange) => {
    const encryptedOldValue = oldValue !== undefined ? await (storage as any)["encrypt"](oldValue) : undefined;
    const encryptedNewValue = newValue !== undefined ? await (storage as any)["encrypt"](newValue) : undefined;

    global.simulateStorageChange({
        storage,
        key,
        oldValue: encryptedOldValue,
        newValue: encryptedNewValue,
        areaName,
    });

    await new Promise(resolve => setTimeout(resolve));
};

// Needed to access a specific key in Storage
// Native GET method does not work correctly with a specific key other than "key"
// Pull Request with bug fix - https://github.com/RickyMarou/jest-webextension-mock/pull/19
global.storageLocalGet = (key: string | string[], storage?: StorageProvider<StorageState>): Promise<any> => {
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

const lockQueues = new Map<string, Promise<void>>();

const createAbortError = () => {
    const error = new Error("The lock request was aborted.");
    error.name = "AbortError";

    return error;
};

const requestLock: LockManager["request"] = async <T>(
    name: string,
    optionsOrCallback: LockOptions | LockGrantedCallback<T>,
    maybeCallback?: LockGrantedCallback<T>
): Promise<T> => {
    const callback = typeof optionsOrCallback === "function" ? optionsOrCallback : maybeCallback;
    const options = typeof optionsOrCallback === "function" ? {} : optionsOrCallback;

    if (!callback) {
        throw new Error("Lock callback is required.");
    }

    const signal = options?.signal;

    if (signal?.aborted) {
        throw createAbortError();
    }

    const previous = lockQueues.get(name) ?? Promise.resolve();

    let release: (() => void) | undefined;

    const current = new Promise<void>(resolve => {
        release = resolve;
    });

    lockQueues.set(name, previous.then(() => current));

    await new Promise<void>((resolve, reject) => {
        const onAbort = () => reject(createAbortError());

        signal?.addEventListener("abort", onAbort, {once: true});

        previous.then(
            () => {
                signal?.removeEventListener("abort", onAbort);

                if (signal?.aborted) {
                    reject(createAbortError());
                    return;
                }

                resolve();
            },
            reject
        );
    });

    try {
        return await callback({name, mode: options?.mode ?? "exclusive"} as Lock);
    } finally {
        release?.();

        if (lockQueues.get(name) === current) {
            lockQueues.delete(name);
        }
    }
};

const locksMock: Pick<LockManager, "request"> = {
    request: requestLock,
};

Object.defineProperty(globalThis.navigator, "locks", {
    value: locksMock,
    writable: true,
    enumerable: true,
    configurable: true,
});
