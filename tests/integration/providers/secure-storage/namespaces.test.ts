import {flushMacrotask, waitFor} from "@tests/support/async";
import {browser} from "@tests/support/browser";
import {encryptedFixture} from "@tests/support/storage";
import SecureStorage from "~/providers/SecureStorage";
import Storage from "~/providers/Storage";

const getAllFromArea = async (area: chrome.storage.AreaName) => chrome.storage[area].get(null);

const namespace = "user";

let securedStorage: SecureStorage;

let securedStorageWithNamespace: SecureStorage;

interface SecureSeparatorState {
    accessToken?: string;
    "refresh:Token"?: string;
}

beforeEach(() => {
    securedStorage = new SecureStorage();
    securedStorageWithNamespace = new SecureStorage({namespace});
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
        const encryptSpy = jest.spyOn(crypto.subtle, "encrypt");
        const decryptSpy = jest.spyOn(crypto.subtle, "decrypt");
        const getSpy = browser.storage.local.get;
        const setSpy = browser.storage.local.set;
        const removeSpy = browser.storage.local.remove;
        const events = browser.storage.onChanged;
        encryptSpy.mockClear();
        decryptSpy.mockClear();
        getSpy.reset();
        setSpy.reset();
        removeSpy.reset();

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
        expect(getSpy.calls).toHaveLength(0);
        expect(setSpy.calls).toHaveLength(0);
        expect(removeSpy.calls).toHaveLength(0);
        expect(events.listenerCount()).toBe(0);
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
        await encrypted.set({theme: "encrypted"});
        const unsubscribeEncrypted = encrypted.subscribe(encryptedCallback);

        try {
            browser.storage.onChanged.emit({"secure:theme": {oldValue: "flat", newValue: "changed-flat"}}, "local");

            await flushMacrotask();

            expect(flatCallback).toHaveBeenCalledTimes(1);
            expect(encryptedCallback).not.toHaveBeenCalled();

            await encrypted.set({theme: "changed-encrypted"});

            expect(flatCallback).toHaveBeenCalledTimes(1);
            await waitFor(() => expect(encryptedCallback).toHaveBeenCalledTimes(1));
        } finally {
            unsubscribeFlat();
            unsubscribeEncrypted();
        }
    });

    test("ignores legacy and malformed keys in getAll, events, and clear", async () => {
        const storage = new SecureStorage<{theme?: string}>();
        const canonical = await encryptedFixture("canonical");
        const ignored = await encryptedFixture("ignored");

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
                browser.storage.onChanged.emit({[fullKey]: {oldValue: ignored, newValue: ignored}}, "local");
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
        const ciphertext = await encryptedFixture("dark");

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
