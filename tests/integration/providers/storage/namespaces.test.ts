import {browser} from "@tests/support/browser";
import Storage from "~/providers/Storage";

const getAllFromArea = async (area: chrome.storage.AreaName) => chrome.storage[area].get(null);

const namespace = "user";

let storage: Storage;

let storageWithNamespace: Storage;

interface SeparatorState {
    good?: string;
    "bad:key"?: string;
    "user:profile"?: string;
}

beforeEach(() => {
    storageWithNamespace = new Storage({namespace});
    storage = new Storage();
});

test("set method - saves data with namespace", async () => {
    await storageWithNamespace.set("theme", "dark");
    const result = browser.storage.local.data[`${namespace}:theme`];
    const secondResult = (await storageWithNamespace.getAll())["theme"];

    expect(result).toEqual("dark");
    expect(secondResult).toEqual("dark");
});

describe("namespace separator validation", () => {
    test("rejects invalid namespaces and factory bucket keys immediately", () => {
        expect(() => new Storage<SeparatorState>({namespace: "invalid:namespace"})).toThrow(
            'Storage namespace "invalid:namespace" must not contain the namespace separator ":".'
        );

        expect(() => Storage.Local<SeparatorState>({key: "invalid:bucket"})).toThrow(
            'Storage key "invalid:bucket" must not contain the namespace separator ":".'
        );
    });

    test("rejects separator keys in every single-key operation and keyed watch before native work", async () => {
        const isolatedStorage = new Storage<SeparatorState>();
        const updater = jest.fn(() => "updated");
        const getSpy = browser.storage.local.get;
        const setSpy = browser.storage.local.set;
        const removeSpy = browser.storage.local.remove;
        const events = browser.storage.onChanged;
        getSpy.reset();
        setSpy.reset();
        removeSpy.reset();

        await expect(isolatedStorage.get("bad:key")).rejects.toThrow(TypeError);
        await expect(isolatedStorage.set("bad:key", "value")).rejects.toThrow(TypeError);
        await expect(isolatedStorage.update("bad:key", updater)).rejects.toThrow(TypeError);
        await expect(isolatedStorage.remove("bad:key")).rejects.toThrow(TypeError);
        expect(() => isolatedStorage.watch({"bad:key": jest.fn()})).toThrow(TypeError);

        expect(updater).not.toHaveBeenCalled();
        expect(getSpy.calls).toHaveLength(0);
        expect(setSpy.calls).toHaveLength(0);
        expect(removeSpy.calls).toHaveLength(0);
        expect(events.listenerCount()).toBe(0);
    });

    test("rejects an entire invalid batch before updater, locks, or native I/O", async () => {
        const isolatedStorage = new Storage<SeparatorState>();
        const updater = jest.fn(() => ({good: "updated"}));
        const getSpy = browser.storage.local.get;
        const setSpy = browser.storage.local.set;
        const removeSpy = browser.storage.local.remove;
        getSpy.reset();
        setSpy.reset();
        removeSpy.reset();

        await expect(isolatedStorage.get(["good", "bad:key"] as const)).rejects.toThrow(TypeError);
        await expect(isolatedStorage.set({good: "value", "bad:key": "invalid"})).rejects.toThrow(TypeError);
        await expect(isolatedStorage.update(["good", "bad:key"] as const, updater)).rejects.toThrow(TypeError);
        await expect(isolatedStorage.remove(["good", "bad:key"])).rejects.toThrow(TypeError);

        expect(updater).not.toHaveBeenCalled();
        expect(getSpy.calls).toHaveLength(0);
        expect(setSpy.calls).toHaveLength(0);
        expect(removeSpy.calls).toHaveLength(0);
    });
});

test("getAll method - returns all values from current namespace", async () => {
    await storage.set("a", 1);
    await storage.set("b", 2);
    await storageWithNamespace.set("c", 3);
    await storageWithNamespace.set("d", 4);

    const result = await storage.getAll();
    const resultWithNamespace = await storageWithNamespace.getAll();

    expect(result).toEqual({a: 1, b: 2});
    expect(resultWithNamespace).toEqual({c: 3, d: 4});
});

test("clear method - removes all keys from current namespace", async () => {
    await storage.set("a", 1);
    await storage.set("b", 2);
    await storageWithNamespace.set("c", 3);
    await storageWithNamespace.set("d", 4);

    await storage.clear();

    const result = await storage.getAll();
    const resultWithNamespace = await storageWithNamespace.getAll();

    expect(result).toEqual({});
    expect(resultWithNamespace).toEqual({c: 3, d: 4});
});

describe("strict physical key codec", () => {
    test("getAll and clear only accept the exact shape for their namespace", async () => {
        const plain = new Storage<{plain?: number}>();
        const namespaced = new Storage<{theme?: string}>({namespace: "auth"});

        await chrome.storage.local.set({
            plain: 1,
            "foreign:value": "keep",
            "auth:theme": "dark",
            "auth:theme:extra": "keep",
        });

        await expect(plain.getAll()).resolves.toEqual({plain: 1});
        await expect(namespaced.getAll()).resolves.toEqual({theme: "dark"});

        await plain.clear();
        await namespaced.clear();

        await expect(getAllFromArea("local")).resolves.toEqual({
            "foreign:value": "keep",
            "auth:theme:extra": "keep",
        });
    });
});
