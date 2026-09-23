import {browser} from "@tests/support/browser";
import SecureStorage from "~/providers/SecureStorage";

const namespace = "user";

let securedStorage: SecureStorage;

let securedStorageWithNamespace: SecureStorage;

let securedStorageWithSecureKey: SecureStorage;

beforeEach(() => {
    securedStorage = new SecureStorage();
    securedStorageWithNamespace = new SecureStorage({namespace});
    securedStorageWithSecureKey = new SecureStorage({secureKey: "customSecureKey"});
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

        const encryptedValue = browser.storage.local.data["secure::key"];
        const decryptedValue = (await securedStorage.getAll())["key"];

        expect(encryptedValue).not.toEqual(value);
        expect(decryptedValue).toEqual(value);
    });
});

describe("set method", () => {
    test("saves secured data with namespace", async () => {
        await securedStorageWithNamespace.set("theme", "dark");

        const encryptedValue = browser.storage.local.data["secure:" + `${namespace}:theme`];
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

        const firstEncryptedValue = browser.storage.local.data["secure:" + `${namespace}:theme`];
        const secondEncryptedValue = browser.storage.local.data["secure::theme"];

        const firstDecryptedValue = (await securedStorageWithNamespace.getAll())["theme"];
        const secondDecryptedValue = (await securedStorageWithSecureKey.getAll())["theme"];

        expect(firstEncryptedValue).not.toBe(secondEncryptedValue);
        expect(firstDecryptedValue).toBe(secondDecryptedValue);
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
        const firstKey = "secure:corrupt:first";
        const secondKey = "secure:corrupt:second";
        await chrome.storage.local.set({[firstKey]: "corrupt:first", [secondKey]: "corrupt:second"});

        const decryptSpy = jest.spyOn(crypto.subtle, "decrypt");
        decryptSpy.mockClear();

        await storage.remove("first");
        expect(browser.storage.local.data["secure:recovery:first"]).toBeUndefined();
        expect(decryptSpy).not.toHaveBeenCalled();

        await storage.clear();
        expect(browser.storage.local.data["secure:recovery:second"]).toBeUndefined();
        expect(decryptSpy).not.toHaveBeenCalled();
    });
});
