import MonoStorage from "./MonoStorage";
import SecureStorage from "./SecureStorage";
import Storage from "./Storage";

import {captureUnhandledErrors, flushMacrotask} from "../../tests/helpers/async";
import {StorageCorruptionError} from "../errors";

const hasArea = (name: keyof typeof chrome.storage) => {
    const area = (chrome.storage as any)[name];

    return area && typeof area.get === "function" && typeof area.clear === "function";
};

const clearAllAreas = async () => {
    const areas: (keyof typeof chrome.storage)[] = ["local", "sync", "managed", "session"] as any;

    for (const a of areas) {
        if (hasArea(a)) {
            await new Promise<void>(resolve => (chrome.storage as any)[a].clear(() => resolve()));
        }
    }
};

const getAllFromArea = async (name: keyof typeof chrome.storage) => {
    return await new Promise<Record<string, any>>(resolve => (chrome.storage as any)[name].get(null, resolve));
};

const namespace = "user";

const securedStorage = new SecureStorage();
const securedStorageWithNamespace = new SecureStorage({namespace});

const securedStorageWithSecureKey = new SecureStorage({
    secureKey: "customSecureKey",
});

interface SecureBatchState {
    accessToken?: string;
    refreshToken?: string;
    attempts?: number;
}

interface SecureSeparatorState {
    accessToken?: string;
    "refresh:Token"?: string;
}

beforeEach(async () => {
    global.resetStorageChangeListeners();
    await clearAllAreas();
});

describe("namespace separator validation", () => {
    test("rejects a namespace containing the secure storage separator", () => {
        expect(() => new SecureStorage({namespace: "auth:tokens"})).toThrow(
            'Storage namespace "auth:tokens" must not contain the namespace separator ":".'
        );
    });

    test("rejects separator keys in every operation before crypto or native I/O", async () => {
        const storage = new SecureStorage<SecureSeparatorState>();
        const singleUpdater = jest.fn(() => "updated");
        const batchUpdater = jest.fn(() => ({accessToken: "updated"}));
        const encryptSpy = crypto.subtle.encrypt as jest.Mock;
        const decryptSpy = crypto.subtle.decrypt as jest.Mock;
        const getSpy = chrome.storage.local.get as jest.Mock;
        const setSpy = chrome.storage.local.set as jest.Mock;
        const removeSpy = chrome.storage.local.remove as jest.Mock;
        const addListenerSpy = chrome.storage.onChanged.addListener as jest.Mock;
        encryptSpy.mockClear();
        decryptSpy.mockClear();
        getSpy.mockClear();
        setSpy.mockClear();
        removeSpy.mockClear();
        addListenerSpy.mockClear();

        await expect(storage.get("refresh:Token")).rejects.toThrow(TypeError);
        await expect(storage.set("refresh:Token", "refresh")).rejects.toThrow(TypeError);
        await expect(storage.update("refresh:Token", singleUpdater)).rejects.toThrow(TypeError);
        await expect(storage.remove("refresh:Token")).rejects.toThrow(TypeError);
        await expect(storage.get(["accessToken", "refresh:Token"] as const)).rejects.toThrow(TypeError);

        await expect(storage.set({accessToken: "access", "refresh:Token": "refresh"})).rejects.toThrow(
            TypeError
        );

        await expect(
            storage.update(["accessToken", "refresh:Token"] as const, batchUpdater)
        ).rejects.toThrow(TypeError);

        await expect(storage.remove(["accessToken", "refresh:Token"])).rejects.toThrow(TypeError);

        expect(() => storage.watch({"refresh:Token": jest.fn()})).toThrow(
            'Storage key "refresh:Token" must not contain the namespace separator ":".'
        );

        expect(singleUpdater).not.toHaveBeenCalled();
        expect(batchUpdater).not.toHaveBeenCalled();
        expect(encryptSpy).not.toHaveBeenCalled();
        expect(decryptSpy).not.toHaveBeenCalled();
        expect(getSpy).not.toHaveBeenCalled();
        expect(setSpy).not.toHaveBeenCalled();
        expect(removeSpy).not.toHaveBeenCalled();
        expect(addListenerSpy).not.toHaveBeenCalled();
    });
});

test("getAll method - returns all values from current namespace", async () => {
    await securedStorage.set("a", 1);
    await securedStorage.set("b", 2);
    await securedStorageWithNamespace.set("c", 3);
    await securedStorageWithNamespace.set("d", 4);

    const result = await securedStorage.getAll();
    const resultWithNamespace = await securedStorageWithNamespace.getAll();

    expect(result).toEqual({a: 1, b: 2});
    expect(resultWithNamespace).toEqual({c: 3, d: 4});
});

test("clear method - removes all keys from current namespace", async () => {
    await securedStorage.set("a", 1);
    await securedStorage.set("b", 2);
    await securedStorageWithNamespace.set("c", 3);
    await securedStorageWithNamespace.set("d", 4);

    await securedStorage.clear();

    const result = await securedStorage.getAll();
    const resultWithNamespace = await securedStorageWithNamespace.getAll();

    expect(result).toEqual({});
    expect(resultWithNamespace).toEqual({c: 3, d: 4});
});

describe("strict physical key codec", () => {
    test("separates an unnamespaced SecureStorage from Storage namespace secure", async () => {
        const flat = new Storage<{theme?: string}>({namespace: "secure"});
        const encrypted = new SecureStorage<{theme?: string}>();

        await flat.set("theme", "flat");
        await encrypted.set("theme", "encrypted");

        const raw = await getAllFromArea("local");
        expect(raw["secure:theme"]).toBe("flat");
        expect(typeof raw["secure::theme"]).toBe("string");
        await expect(flat.get("theme")).resolves.toBe("flat");
        await expect(encrypted.get("theme")).resolves.toBe("encrypted");

        const flatCallback = jest.fn();
        const encryptedCallback = jest.fn();
        const unsubscribeFlat = flat.subscribe(flatCallback);
        const unsubscribeEncrypted = encrypted.subscribe(encryptedCallback);

        try {
            global.simulateStorageChange({
                storage: flat,
                key: "theme",
                oldValue: "flat",
                newValue: "changed-flat",
            });

            await flushMacrotask();

            expect(flatCallback).toHaveBeenCalledTimes(1);
            expect(encryptedCallback).not.toHaveBeenCalled();

            await global.simulateSecureStorageChange({
                storage: encrypted,
                key: "theme",
                oldValue: "encrypted",
                newValue: "changed-encrypted",
            });

            expect(flatCallback).toHaveBeenCalledTimes(1);
            expect(encryptedCallback).toHaveBeenCalledTimes(1);
        } finally {
            unsubscribeFlat();
            unsubscribeEncrypted();
        }
    });

    test("ignores legacy and malformed keys in getAll, events, and clear", async () => {
        const storage = new SecureStorage<{theme?: string}>();
        const canonical = await (storage as any).encrypt("canonical");
        const ignored = await (storage as any).encrypt("ignored");

        await chrome.storage.local.set({
            "secure::theme": canonical,
            "secure:legacy": ignored,
            "secure:::extra": ignored,
            "secure:other:theme": ignored,
        });

        await expect(storage.getAll()).resolves.toEqual({theme: "canonical"});

        const callback = jest.fn();
        const unsubscribe = storage.subscribe(callback);

        try {
            for (const fullKey of ["secure:legacy", "secure:::extra", "secure:other:theme"]) {
                global.simulateStorageChanges({
                    storage: {getFullKey: () => fullKey},
                    changes: {theme: {oldValue: ignored, newValue: ignored}},
                });
            }

            await flushMacrotask();
            expect(callback).not.toHaveBeenCalled();
        } finally {
            unsubscribe();
        }

        await storage.clear();

        await expect(getAllFromArea("local")).resolves.toEqual({
            "secure:legacy": ignored,
            "secure:::extra": ignored,
            "secure:other:theme": ignored,
        });
    });

    test("reads an unchanged ciphertext after a manual raw legacy migration", async () => {
        const storage = new SecureStorage<{theme?: string}>();
        const ciphertext = await (storage as any).encrypt("dark");

        await chrome.storage.local.set({"secure:theme": ciphertext});

        await expect(storage.get("theme")).resolves.toBeUndefined();
        await expect(storage.getAll()).resolves.toEqual({});

        const beforeMigration = await getAllFromArea("local");
        expect(beforeMigration["secure::theme"]).toBeUndefined();

        await chrome.storage.local.set({"secure::theme": beforeMigration["secure:theme"]});
        await chrome.storage.local.remove("secure:theme");

        const afterMigration = await getAllFromArea("local");
        expect(afterMigration["secure::theme"]).toBe(ciphertext);
        expect(afterMigration["secure:theme"]).toBeUndefined();
        await expect(storage.get("theme")).resolves.toBe("dark");
    });
});

describe("set/get methods with different type of value", () => {
    test.each([
        ["string", "hello"],
        ["number", 42],
        ["boolean", true],
        ["null", null],
        ["object", {a: 1, b: true}],
        ["array", [1, 2, 3]],
    ])("set/get with %s", async (_, value) => {
        await securedStorage.set("key", value);

        const encryptedValue = await global.storageLocalGet("key", securedStorage);
        const decryptedValue = (await securedStorage.getAll())["key"];

        expect(encryptedValue).not.toEqual(value);
        expect(decryptedValue).toEqual(value);
    });
});

describe("set method", () => {
    test("saves secured data with namespace", async () => {
        await securedStorageWithNamespace.set("theme", "dark");

        const encryptedValue = await global.storageLocalGet("theme", securedStorageWithNamespace);
        const decryptedValue = (await securedStorageWithNamespace.getAll())["theme"];

        expect(encryptedValue).not.toEqual("dark");
        expect(decryptedValue).toEqual("dark");
    });

    test('added "secure:" prefix to keys', async () => {
        await securedStorage.set("theme", "dark");
        await securedStorageWithNamespace.set("volume", 100);

        const allFullKeys = Object.keys(await chrome.storage.local.get(null));

        expect(allFullKeys.length).toBeGreaterThan(0);

        allFullKeys.forEach(key => expect(key.startsWith("secure:")).toBe(true));
    });

    test("saves the same data with different secureKey in different encrypted format", async () => {
        await securedStorageWithNamespace.set("theme", "dark");
        await securedStorageWithSecureKey.set("theme", "dark");

        const firstEncryptedValue = await global.storageLocalGet("theme", securedStorageWithNamespace);
        const secondEncryptedValue = await global.storageLocalGet("theme", securedStorageWithSecureKey);

        const firstDecryptedValue = (await securedStorageWithNamespace.getAll())["theme"];
        const secondDecryptedValue = (await securedStorageWithSecureKey.getAll())["theme"];

        expect(firstEncryptedValue).not.toBe(secondEncryptedValue);
        expect(firstDecryptedValue).toBe(secondDecryptedValue);
    });
});

describe("update method", () => {
    test("skips encryption and storage write when decrypted value is equal", async () => {
        await securedStorage.set("settings", {theme: "dark"});

        const encryptSpy = crypto.subtle.encrypt as jest.Mock;
        const setSpy = chrome.storage.local.set as jest.Mock;
        encryptSpy.mockClear();
        setSpy.mockClear();

        await securedStorage.update("settings", prev => ({...prev}));

        expect(encryptSpy).not.toHaveBeenCalled();
        expect(setSpy).not.toHaveBeenCalled();
        expect((await securedStorage.getAll())["settings"]).toEqual({theme: "dark"});
    });
});

describe("batch overloads", () => {
    test("batch set encrypts namespaced values into one native write and batch get decrypts one native read", async () => {
        const storage = new SecureStorage<SecureBatchState>({namespace: "auth"});
        const setSpy = chrome.storage.local.set as jest.Mock;
        setSpy.mockClear();

        await storage.set({accessToken: "access", refreshToken: "refresh"});

        expect(setSpy).toHaveBeenCalledTimes(1);

        const setPayload = setSpy.mock.calls[0]?.[0];
        expect(Object.keys(setPayload)).toEqual(["secure:auth:accessToken", "secure:auth:refreshToken"]);
        expect(typeof setPayload["secure:auth:accessToken"]).toBe("string");
        expect(typeof setPayload["secure:auth:refreshToken"]).toBe("string");
        expect(setPayload["secure:auth:accessToken"]).not.toBe("access");
        expect(setPayload["secure:auth:refreshToken"]).not.toBe("refresh");

        const getSpy = chrome.storage.local.get as jest.Mock;
        getSpy.mockClear();

        await expect(storage.get(["accessToken", "refreshToken", "attempts"] as const)).resolves.toEqual({
            accessToken: "access",
            refreshToken: "refresh",
        });

        expect(getSpy).toHaveBeenCalledTimes(1);

        expect(getSpy).toHaveBeenCalledWith(
            ["secure:auth:accessToken", "secure:auth:refreshToken", "secure:auth:attempts"],
            expect.any(Function)
        );
    });

    test("batch set performs no storage write when any encryption fails", async () => {
        const storage = new SecureStorage<SecureBatchState>();
        const encryptMock = crypto.subtle.encrypt as jest.Mock;
        const defaultImplementation = encryptMock.getMockImplementation();
        const setSpy = chrome.storage.local.set as jest.Mock;

        expect(defaultImplementation).toBeDefined();
        encryptMock.mockImplementationOnce(defaultImplementation as (...args: any[]) => any);
        encryptMock.mockRejectedValueOnce(new Error("encryption failed"));
        setSpy.mockClear();

        await expect(storage.set({accessToken: "access", refreshToken: "refresh"})).rejects.toThrow(
            "encryption failed"
        );

        expect(setSpy).not.toHaveBeenCalled();
        await expect(storage.get(["accessToken", "refreshToken"] as const)).resolves.toEqual({});
    });

    test("batch set rejects undefined before encrypting any value", async () => {
        const storage = new SecureStorage<SecureBatchState>();
        const encryptSpy = crypto.subtle.encrypt as jest.Mock;
        const setSpy = chrome.storage.local.set as jest.Mock;
        encryptSpy.mockClear();
        setSpy.mockClear();

        await expect(
            storage.set({accessToken: "access", refreshToken: undefined} as Partial<SecureBatchState>)
        ).rejects.toThrow(TypeError);

        expect(encryptSpy).not.toHaveBeenCalled();
        expect(setSpy).not.toHaveBeenCalled();
    });

    test("batch update compares decrypted values and encrypts only changed keys before one native write", async () => {
        const storage = new SecureStorage<SecureBatchState>({namespace: "auth"});
        await storage.set({accessToken: "old", refreshToken: "same", attempts: 1});

        const encryptSpy = crypto.subtle.encrypt as jest.Mock;
        const setSpy = chrome.storage.local.set as jest.Mock;
        const removeSpy = chrome.storage.local.remove as jest.Mock;
        encryptSpy.mockClear();
        setSpy.mockClear();
        removeSpy.mockClear();

        const result = await storage.update(
            ["accessToken", "refreshToken", "attempts"] as const,
            prev => ({
                accessToken: `${prev.accessToken}:next`,
                refreshToken: "same",
                attempts: 2,
            })
        );

        expect(result).toEqual({accessToken: "old:next", refreshToken: "same", attempts: 2});
        expect(encryptSpy).toHaveBeenCalledTimes(2);
        expect(setSpy).toHaveBeenCalledTimes(1);
        expect(Object.keys(setSpy.mock.calls[0]?.[0])).toEqual(["secure:auth:accessToken", "secure:auth:attempts"]);
        expect(removeSpy).not.toHaveBeenCalled();
    });

    test("batch update does not encrypt or write an equal patch", async () => {
        const storage = new SecureStorage<SecureBatchState>();
        await storage.set({accessToken: "same", attempts: 1});

        const encryptSpy = crypto.subtle.encrypt as jest.Mock;
        const setSpy = chrome.storage.local.set as jest.Mock;
        const removeSpy = chrome.storage.local.remove as jest.Mock;
        encryptSpy.mockClear();
        setSpy.mockClear();
        removeSpy.mockClear();

        await expect(
            storage.update(["accessToken", "attempts"] as const, () => ({accessToken: "same", attempts: 1}))
        ).resolves.toEqual({accessToken: "same", attempts: 1});

        expect(encryptSpy).not.toHaveBeenCalled();
        expect(setSpy).not.toHaveBeenCalled();
        expect(removeSpy).not.toHaveBeenCalled();
    });

    test("aggregate comparer receives decrypted snapshots and can skip the whole patch", async () => {
        const storage = new SecureStorage<SecureBatchState>({namespace: "auth"});
        await storage.set({accessToken: "old", refreshToken: "remove", attempts: 1});

        const compare = jest.fn(() => true);
        const encryptSpy = crypto.subtle.encrypt as jest.Mock;
        const setSpy = chrome.storage.local.set as jest.Mock;
        const removeSpy = chrome.storage.local.remove as jest.Mock;
        encryptSpy.mockClear();
        setSpy.mockClear();
        removeSpy.mockClear();

        const result = await storage.update(
            ["accessToken", "refreshToken", "attempts"] as const,
            () => ({accessToken: "new", refreshToken: undefined}),
            {compare}
        );

        expect(compare).toHaveBeenCalledTimes(1);

        expect(compare).toHaveBeenCalledWith(
            {accessToken: "old", refreshToken: "remove", attempts: 1},
            {accessToken: "new", attempts: 1}
        );

        expect(result).toEqual({accessToken: "old", refreshToken: "remove", attempts: 1});
        expect(encryptSpy).not.toHaveBeenCalled();
        expect(setSpy).not.toHaveBeenCalled();
        expect(removeSpy).not.toHaveBeenCalled();
    });

    test("aggregate comparer can force every explicit value to be encrypted and written", async () => {
        const storage = new SecureStorage<SecureBatchState>({namespace: "auth"});
        await storage.set({accessToken: "same", attempts: 1});

        const compare = jest.fn(() => false);
        const encryptSpy = crypto.subtle.encrypt as jest.Mock;
        const setSpy = chrome.storage.local.set as jest.Mock;
        encryptSpy.mockClear();
        setSpy.mockClear();

        const result = await storage.update(
            ["accessToken", "attempts"] as const,
            () => ({accessToken: "same", attempts: 2}),
            {compare}
        );

        expect(compare).toHaveBeenCalledWith(
            {accessToken: "same", attempts: 1},
            {accessToken: "same", attempts: 2}
        );

        expect(result).toEqual({accessToken: "same", attempts: 2});
        expect(encryptSpy).toHaveBeenCalledTimes(2);
        expect(setSpy).toHaveBeenCalledTimes(1);
        expect(Object.keys(setSpy.mock.calls[0]?.[0])).toEqual(["secure:auth:accessToken", "secure:auth:attempts"]);
    });

    test("batch update encrypts writes before removing deleted keys in a mixed patch", async () => {
        const storage = new SecureStorage<SecureBatchState>({namespace: "auth"});
        await storage.set({accessToken: "old", refreshToken: "remove"});

        const encryptSpy = crypto.subtle.encrypt as jest.Mock;
        const setSpy = chrome.storage.local.set as jest.Mock;
        const removeSpy = chrome.storage.local.remove as jest.Mock;
        encryptSpy.mockClear();
        setSpy.mockClear();
        removeSpy.mockClear();

        const result = await storage.update(["accessToken", "refreshToken"] as const, () => ({
            accessToken: "new",
            refreshToken: undefined,
        }));

        expect(result).toEqual({accessToken: "new"});
        expect(encryptSpy).toHaveBeenCalledTimes(1);
        expect(setSpy).toHaveBeenCalledTimes(1);
        expect(Object.keys(setSpy.mock.calls[0]?.[0])).toEqual(["secure:auth:accessToken"]);
        expect(removeSpy).toHaveBeenCalledTimes(1);
        expect(removeSpy).toHaveBeenCalledWith(["secure:auth:refreshToken"], expect.any(Function));
        expect(setSpy.mock.invocationCallOrder[0]).toBeLessThan(removeSpy.mock.invocationCallOrder[0]);
    });
});

describe("remove method", () => {
    test("deletes the key without namespace", async () => {
        await securedStorage.set("theme", "dark");
        await securedStorage.remove("theme");
        const result = (await securedStorage.getAll())["theme"];
        expect(result).toBeUndefined();
    });

    test("deletes the key with namespace", async () => {
        await securedStorageWithNamespace.set("theme", "dark");
        await securedStorageWithNamespace.remove("theme");
        const result = (await securedStorageWithNamespace.getAll())["theme"];
        expect(result).toBeUndefined();
    });

    test("remove and clear recover corrupted values without decrypting them", async () => {
        const storage = new SecureStorage<{first?: string; second?: string}>({namespace: "recovery"});
        const firstKey = (storage as any).getFullKey("first");
        const secondKey = (storage as any).getFullKey("second");
        await chrome.storage.local.set({[firstKey]: "corrupt:first", [secondKey]: "corrupt:second"});

        const decryptSpy = crypto.subtle.decrypt as jest.Mock;
        decryptSpy.mockClear();

        await storage.remove("first");
        expect(await global.storageLocalGet("first", storage)).toBeUndefined();
        expect(decryptSpy).not.toHaveBeenCalled();

        await storage.clear();
        expect(await global.storageLocalGet("second", storage)).toBeUndefined();
        expect(decryptSpy).not.toHaveBeenCalled();
    });
});

describe("corrupted values", () => {
    test("single, batch, and getAll reads reject instead of returning defaults", async () => {
        const storage = new SecureStorage<SecureBatchState>({namespace: "corrupt"});
        const fullKey = (storage as any).getFullKey("accessToken");
        await chrome.storage.local.set({[fullKey]: ""});

        await expect(storage.get("accessToken")).rejects.toBeInstanceOf(StorageCorruptionError);

        await expect(storage.get(["accessToken", "attempts"] as const)).rejects.toBeInstanceOf(
            StorageCorruptionError
        );

        await expect(storage.getAll()).rejects.toBeInstanceOf(StorageCorruptionError);
    });

    test("a present undefined storage property is corruption while a missing property is absent", async () => {
        const storage = new SecureStorage<SecureBatchState>({namespace: "corrupt-undefined"});
        const fullKey = (storage as any).getFullKey("accessToken");
        const getSpy = chrome.storage.local.get as jest.Mock;

        getSpy
            .mockImplementationOnce((_keys: unknown, callback: (items: Record<string, unknown>) => void) => {
                callback({[fullKey]: undefined});
            })
            .mockImplementationOnce((_keys: unknown, callback: (items: Record<string, unknown>) => void) => {
                callback({[fullKey]: undefined});
            })
            .mockImplementationOnce((_keys: unknown, callback: (items: Record<string, unknown>) => void) => {
                callback({[fullKey]: undefined});
            });

        await expect(storage.get("accessToken")).rejects.toBeInstanceOf(StorageCorruptionError);
        await expect(storage.get(["accessToken"] as const)).rejects.toBeInstanceOf(StorageCorruptionError);
        await expect(storage.getAll()).rejects.toBeInstanceOf(StorageCorruptionError);

        await expect(storage.get("accessToken")).resolves.toBeUndefined();
    });
});

describe("watch and subscribe methods", () => {
    test("event decoding ignores inherited change sides", async () => {
        const storage = new SecureStorage<SecureBatchState>({namespace: "event-own-fields"});
        const encryptedOldValue = await (storage as any).encrypt("old");
        const callback = jest.fn();
        const errors = captureUnhandledErrors();
        const unsubscribe = storage.subscribe(callback);
        const change = Object.create({newValue: {corrupted: true}}) as chrome.storage.StorageChange;

        Object.defineProperty(change, "oldValue", {
            enumerable: true,
            value: encryptedOldValue,
        });

        try {
            global.simulateStorageChanges({storage, changes: {accessToken: change}});
            await flushMacrotask();

            expect(callback).toHaveBeenCalledWith({
                accessToken: {oldValue: "old", newValue: undefined},
            });

            expect(errors.pending).toBe(0);
        } finally {
            unsubscribe();
            errors.restore();
        }
    });

    test("event decoding treats omitted and own undefined sides as absent", async () => {
        const storage = new SecureStorage<SecureBatchState>({namespace: "event-absence"});
        const encryptedValue = await (storage as any).encrypt("value");
        const callback = jest.fn();
        const unsubscribe = storage.subscribe(callback);

        global.simulateStorageChanges({
            storage,
            changes: {accessToken: {newValue: encryptedValue}},
        });

        global.simulateStorageChanges({
            storage,
            changes: {accessToken: {oldValue: encryptedValue}},
        });

        global.simulateStorageChanges({
            storage,
            changes: {accessToken: {oldValue: undefined, newValue: encryptedValue}},
        });

        global.simulateStorageChanges({
            storage,
            changes: {accessToken: {oldValue: encryptedValue, newValue: undefined}},
        });

        await flushMacrotask();

        expect(callback.mock.calls).toEqual([
            [{accessToken: {oldValue: undefined, newValue: "value"}}],
            [{accessToken: {oldValue: "value", newValue: undefined}}],
            [{accessToken: {oldValue: undefined, newValue: "value"}}],
            [{accessToken: {oldValue: "value", newValue: undefined}}],
        ]);

        unsubscribe();
    });

    test("subscribe decrypts one native multi-key event into one logical change map", async () => {
        const storage = new SecureStorage<SecureBatchState>({namespace: "auth"});
        const callback = jest.fn();
        const unsubscribe = storage.subscribe(callback);

        await global.simulateSecureStorageChanges({
            storage,
            changes: {
                accessToken: {oldValue: "old", newValue: "new"},
                attempts: {oldValue: 1, newValue: 2},
            },
        });

        expect(callback).toHaveBeenCalledTimes(1);

        expect(callback).toHaveBeenCalledWith({
            accessToken: {oldValue: "old", newValue: "new"},
            attempts: {oldValue: 1, newValue: 2},
        });

        unsubscribe();
    });

    test("subscribe filters changes whose decrypted values are equal", async () => {
        const storage = new SecureStorage<SecureBatchState>();
        const callback = jest.fn();
        const unsubscribe = storage.subscribe(callback);

        await global.simulateSecureStorageChanges({
            storage,
            changes: {
                accessToken: {oldValue: "same", newValue: "same"},
                attempts: {oldValue: 1, newValue: 2},
            },
        });

        expect(callback).toHaveBeenCalledTimes(1);
        expect(callback).toHaveBeenCalledWith({attempts: {oldValue: 1, newValue: 2}});
        unsubscribe();
    });

    test("serializes decrypt formatting while not waiting for subscriber promises", async () => {
        const storage = new SecureStorage<{value?: string}>({namespace: "ordered"});
        let releaseFirst: ((value: string) => void) | undefined;

        const firstValue = new Promise<string>(resolve => {
            releaseFirst = resolve;
        });

        const decryptSpy = jest.spyOn(storage as any, "decrypt").mockImplementation((value: unknown) => {
            if (value === "slow") {
                return firstValue;
            }

            return Promise.resolve(String(value));
        });

        const neverSettles = new Promise<void>(() => undefined);
        const callback = jest.fn().mockReturnValueOnce(neverSettles).mockReturnValue(undefined);
        const unsubscribe = storage.subscribe(callback);

        global.simulateStorageChange({storage, key: "value", oldValue: undefined, newValue: "slow"});
        global.simulateStorageChange({storage, key: "value", oldValue: "slow", newValue: "fast"});

        await Promise.resolve();
        expect(decryptSpy).toHaveBeenCalledTimes(1);

        releaseFirst?.("first");
        await flushMacrotask();

        expect(callback).toHaveBeenNthCalledWith(1, {value: {oldValue: undefined, newValue: "first"}});
        expect(callback).toHaveBeenNthCalledWith(2, {value: {oldValue: "first", newValue: "fast"}});

        unsubscribe();
        decryptSpy.mockRestore();
    });

    test("unsubscribe during decrypt prevents late callback and future delivery", async () => {
        const storage = new SecureStorage<{value?: string}>({namespace: "unsubscribe-pending"});
        let releaseDecrypt: ((value: string) => void) | undefined;

        const pendingDecrypt = new Promise<string>(resolve => {
            releaseDecrypt = resolve;
        });

        const decryptSpy = jest.spyOn(storage as any, "decrypt").mockImplementation((value: unknown) => {
            if (value === "pending") {
                return pendingDecrypt;
            }

            return Promise.resolve(String(value));
        });

        const callback = jest.fn();
        const unsubscribe = storage.subscribe(callback);

        try {
            global.simulateStorageChange({
                storage,
                key: "value",
                oldValue: undefined,
                newValue: "pending",
            });

            await Promise.resolve();
            expect(decryptSpy).toHaveBeenCalledTimes(1);

            unsubscribe();
            releaseDecrypt?.("decoded");
            await flushMacrotask();

            global.simulateStorageChange({
                storage,
                key: "value",
                oldValue: "decoded",
                newValue: "future",
            });

            await flushMacrotask();

            expect(callback).not.toHaveBeenCalled();
            expect(decryptSpy).toHaveBeenCalledTimes(1);
        } finally {
            unsubscribe();
            decryptSpy.mockRestore();
        }
    });

    test("a keyed watch handler can unsubscribe before later handlers in the same event", async () => {
        const storage = new SecureStorage<{theme?: string; volume?: number}>({namespace: "watch-unsubscribe"});
        const volumeCallback = jest.fn();
        let unsubscribe: () => void = () => undefined;
        const themeCallback = jest.fn(() => unsubscribe());

        unsubscribe = storage.watch({theme: themeCallback, volume: volumeCallback});

        try {
            await global.simulateSecureStorageChanges({
                storage,
                changes: {
                    theme: {oldValue: "light", newValue: "dark"},
                    volume: {oldValue: 10, newValue: 20},
                },
            });

            expect(themeCallback).toHaveBeenCalledTimes(1);
            expect(themeCallback).toHaveBeenCalledWith("dark", "light");
            expect(volumeCallback).not.toHaveBeenCalled();
        } finally {
            unsubscribe();
        }
    });

    test("corruption in an unrelated key kills watch without partial or future delivery", async () => {
        const storage = new SecureStorage<{theme?: string; unrelated?: string}>({namespace: "event-corruption"});
        const themeCallback = jest.fn();
        const errors = captureUnhandledErrors();
        const unsubscribe = storage.watch({theme: themeCallback});

        try {
            const oldTheme = await (storage as any).encrypt("light");
            const newTheme = await (storage as any).encrypt("dark");

            global.simulateStorageChanges({
                storage,
                changes: {
                    theme: {oldValue: oldTheme, newValue: newTheme},
                    unrelated: {oldValue: null, newValue: {corrupted: true}},
                },
            });

            await flushMacrotask();

            expect(themeCallback).not.toHaveBeenCalled();
            expect(errors.pending).toBe(1);
            expect(() => errors.runNext()).toThrow(StorageCorruptionError);

            await global.simulateSecureStorageChange({
                storage,
                key: "theme",
                oldValue: "dark",
                newValue: "later",
            });

            expect(themeCallback).not.toHaveBeenCalled();
            expect(errors.pending).toBe(0);
        } finally {
            unsubscribe();
            errors.restore();
        }
    });

    test("calls specific key callback on change", async () => {
        const keyCallback = jest.fn();

        securedStorage.watch({theme: keyCallback});

        await global.simulateSecureStorageChange({
            storage: securedStorage,
            key: "theme",
            oldValue: "light",
            newValue: "dark",
        });

        expect(keyCallback).toHaveBeenCalledWith("dark", "light");
    });

    test("does not call key callback for unrelated key", async () => {
        const keyCallback = jest.fn();

        securedStorage.watch({theme: keyCallback});

        await global.simulateSecureStorageChange({
            storage: securedStorage,
            key: "volume",
            oldValue: 50,
            newValue: 80,
        });

        expect(keyCallback).not.toHaveBeenCalled();
    });

    test("calls global callback on any change", async () => {
        const globalCallback = jest.fn();
        securedStorage.watch(globalCallback);

        await global.simulateSecureStorageChange({
            storage: securedStorage,
            key: "theme",
            oldValue: "light",
            newValue: "dark",
        });

        await global.simulateSecureStorageChange({
            storage: securedStorage,
            key: "volume",
            oldValue: 50,
            newValue: 80,
        });

        expect(globalCallback).toHaveBeenCalledWith(80, 50, "volume");
        expect(globalCallback).toHaveBeenCalledWith("dark", "light", "theme");
    });

    test("calls both key and global callbacks", async () => {
        const keyCallback = jest.fn();
        const globalCallback = jest.fn();
        securedStorage.watch({theme: keyCallback});
        securedStorage.watch(globalCallback);

        await global.simulateSecureStorageChange({
            storage: securedStorage,
            key: "theme",
            oldValue: "light",
            newValue: "dark",
        });

        await global.simulateSecureStorageChange({
            storage: securedStorage,
            key: "volume",
            oldValue: 50,
            newValue: 80,
        });

        expect(keyCallback).toHaveBeenCalledWith("dark", "light");
        expect(globalCallback).toHaveBeenCalledWith(80, 50, "volume");
        expect(globalCallback).toHaveBeenCalledWith("dark", "light", "theme");
    });

    test("terminates a watch and schedules an uncaught error for a corrupted change", async () => {
        const keyCallback = jest.fn();
        const errors = captureUnhandledErrors();

        try {
            securedStorage.watch({theme: keyCallback});

            global.simulateStorageChange({
                storage: securedStorage,
                key: "theme",
                oldValue: null,
                newValue: {theme: "dark"},
            });

            global.simulateStorageChange({
                storage: securedStorage,
                key: "theme",
                oldValue: "ignored",
                newValue: "ignored-too",
            });

            await flushMacrotask();

            expect(keyCallback).not.toHaveBeenCalled();
            expect(errors.pending).toBe(1);
            expect(() => errors.runNext()).toThrow(StorageCorruptionError);

            global.simulateStorageChange({
                storage: securedStorage,
                key: "theme",
                oldValue: "still-ignored",
                newValue: "still-ignored-too",
            });

            await flushMacrotask();
            expect(keyCallback).not.toHaveBeenCalled();
        } finally {
            errors.restore();
        }
    });
});

// Static factory methods tests migrated from AbstractStorage.static.test.ts

describe("static factory methods", () => {
    describe("make()", () => {
        test("SecureStorage.make() returns provider by default and MonoStorage with key", async () => {
            const s = SecureStorage.make();
            expect(s).toBeInstanceOf(SecureStorage);

            const mono = SecureStorage.make({key: "bucket"});
            expect(mono).toBeInstanceOf(MonoStorage);

            await (s as SecureStorage<any>).set("a" as any, 1 as any);

            const localAll = await getAllFromArea("local");
            // secure provider stores encrypted value; we just assert key exists
            const secureKey = Object.keys(localAll).find(k => k.endsWith(":a") || k === "secure:a");
            expect(secureKey?.startsWith("secure:")).toBe(true);
        });
    });

    describe("Area shortcuts", () => {
        test("SecureStorage.Local() forwards secureKey to key derivation", async () => {
            const digestSpy = crypto.subtle.digest as jest.Mock;
            digestSpy.mockClear();

            const storage = SecureStorage.Local<{theme?: string}>({
                namespace: "factory-secure-key",
                secureKey: "ForwardedSecureKey",
            });

            await storage.set("theme", "dark");

            expect(digestSpy).toHaveBeenCalledTimes(1);

            expect(digestSpy).toHaveBeenCalledWith(
                "SHA-256",
                new TextEncoder().encode("ForwardedSecureKey")
            );
        });

        test("SecureStorage.Session<State>() writes encrypted data to the session area", async () => {
            if (!hasArea("session")) {
                return;
            }

            const storage = SecureStorage.Session<{token?: string}>({secureKey: "SessionSecureKey"});

            await storage.set("token", "session-token");

            const sessionValues = await getAllFromArea("session");
            expect(typeof sessionValues["secure::token"]).toBe("string");

            const localValues = await getAllFromArea("local");
            expect(localValues["secure::token"]).toBeUndefined();
        });

        test("SecureStorage.Local() returns secure provider and MonoStorage with key", async () => {
            const s = SecureStorage.Local();
            expect(s).toBeInstanceOf(SecureStorage);

            await (s as SecureStorage<any>).set("y" as any, 20 as any);
            const localAll = await getAllFromArea("local");
            const hasSecureKey = Object.keys(localAll).some(k => k.startsWith("secure:"));
            expect(hasSecureKey).toBe(true);

            const mono = SecureStorage.Local({key: "bucket"});
            expect(mono).toBeInstanceOf(MonoStorage);
            await (mono as unknown as MonoStorage<any, any>).set("z" as any, 3 as any);
            const localAll2 = await getAllFromArea("local");
            // The physical key is secured with prefix
            const secBucketKey = Object.keys(localAll2).find(k => k.endsWith(":bucket") || k === "secure:bucket");
            expect(secBucketKey?.startsWith("secure:")).toBe(true);
        });
    });
});
