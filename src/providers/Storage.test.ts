import MonoStorage from "./MonoStorage";
import Storage from "./Storage";
import type {StorageLocker} from "../types";

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
const storage = new Storage();
const storageWithNamespace = new Storage({namespace});
const originalLocks = globalThis.navigator.locks;

beforeEach(async () => {
    await clearAllAreas();
});

afterEach(() => {
    Object.defineProperty(globalThis.navigator, "locks", {
        value: originalLocks,
        writable: true,
        enumerable: true,
        configurable: true,
    });
});

test("set method - saves data with namespace", async () => {
    await storageWithNamespace.set("theme", "dark");
    const result = await global.storageLocalGet("theme", storageWithNamespace);
    const secondResult = (await storageWithNamespace.getAll())["theme"];

    expect(result).toEqual("dark");
    expect(secondResult).toEqual("dark");
});

test("update method - serializes concurrent writes for the same key", async () => {
    await storage.set("count", 0);

    await Promise.all([
        storage.update("count", async prev => {
            await new Promise(resolve => setTimeout(resolve, 10));
            return (prev ?? 0) + 1;
        }),
        storage.update("count", async prev => {
            await new Promise(resolve => setTimeout(resolve, 10));
            return (prev ?? 0) + 1;
        }),
    ]);

    expect(await storage.get("count")).toBe(2);
});

test("update method - fails when Web Locks API is unavailable", async () => {
    Object.defineProperty(globalThis.navigator, "locks", {
        value: undefined,
        writable: true,
        enumerable: true,
        configurable: true,
    });

    const isolatedStorage = new Storage();

    await expect(isolatedStorage.update("counter", prev => (prev ?? 0) + 1)).rejects.toThrow(
        "Atomic storage update is unavailable: Web Locks API is not supported in this context."
    );
});

test("set method - works without Web Locks API", async () => {
    Object.defineProperty(globalThis.navigator, "locks", {
        value: undefined,
        writable: true,
        enumerable: true,
        configurable: true,
    });

    const isolatedStorage = new Storage();

    await isolatedStorage.set("displayName", "Ada Lovelace");

    expect(await global.storageLocalGet("displayName", isolatedStorage)).toBe("Ada Lovelace");
});

test("remove method - waits for pending update on the same key", async () => {
    await storage.set("theme", "light");

    const updatePromise = storage.update("theme", async () => {
        await new Promise(resolve => setTimeout(resolve, 20));
        return "dark";
    });

    const removePromise = storage.remove("theme");

    await Promise.all([updatePromise, removePromise]);

    expect(await storage.get("theme")).toBeUndefined();
});

test("remove method - preserves stored value when waiting for the lock is aborted", async () => {
    await storage.set("profileState", "active");

    const locker: StorageLocker = {
        async request() {
            const error = new Error("The lock request was aborted.");
            error.name = "AbortError";
            throw error;
        },
    };

    const isolatedStorage = new Storage({locker});

    await isolatedStorage.set("profileState", "active");

    await expect(isolatedStorage.remove("profileState")).rejects.toMatchObject({name: "AbortError"});

    expect(await isolatedStorage.get("profileState")).toBe("active");
});

test("update method - forwards lock options to custom storage locker", async () => {
    const requests: Array<{name: string; options: any}> = [];

    const locker: StorageLocker = {
        async request(name, task, options) {
            requests.push({name, options});
            return await task();
        },
    };

    const isolatedStorage = new Storage({locker});
    const controller = new AbortController();
    const compare = () => false;

    await isolatedStorage.update("counter", prev => (prev ?? 0) + 1, {
        signal: controller.signal,
        timeout: 25,
        compare,
    });

    expect(requests).toEqual([
        {
            name: "counter",
            options: {signal: controller.signal, timeout: 25},
        },
    ]);

    expect(await isolatedStorage.get("counter")).toBe(1);
});

describe("update method - no-op writes", () => {
    test.each([
        ["primitive", "dark", () => "dark"],
        ["object", {theme: "dark"}, (prev: {theme: string} | undefined) => ({...prev})],
    ])("skips storage.set when the next %s value is equal", async (_, initialValue, updater) => {
        await storage.set("settings", initialValue);

        const setSpy = chrome.storage.local.set as jest.Mock;
        setSpy.mockClear();

        await storage.update("settings", updater as any);

        expect(setSpy).not.toHaveBeenCalled();
        expect(await storage.get("settings")).toEqual(initialValue);
    });

    test("writes when the next value changes", async () => {
        await storage.set("settings", {theme: "light"});

        const setSpy = chrome.storage.local.set as jest.Mock;
        setSpy.mockClear();

        await storage.update("settings", prev => ({...prev, theme: "dark"}));

        expect(setSpy).toHaveBeenCalledTimes(1);
        expect(await storage.get("settings")).toEqual({theme: "dark"});
    });

    test("writes when creating a missing value", async () => {
        const setSpy = chrome.storage.local.set as jest.Mock;
        setSpy.mockClear();

        await storage.update("settings", () => ({theme: "dark"}));

        expect(setSpy).toHaveBeenCalledTimes(1);
        expect(await storage.get("settings")).toEqual({theme: "dark"});
    });

    test("skips storage.remove when deleting an already missing value", async () => {
        const removeSpy = chrome.storage.local.remove as jest.Mock;
        removeSpy.mockClear();

        await storage.update("missing", () => undefined);

        expect(removeSpy).not.toHaveBeenCalled();
    });

    test("custom compare can force a write for equal values", async () => {
        const initialValue = {theme: "dark"};
        const nextValue = {theme: "dark"};
        const compare = jest.fn(() => false);

        await storage.set("settings", initialValue);

        const setSpy = chrome.storage.local.set as jest.Mock;
        setSpy.mockClear();

        await storage.update("settings", () => nextValue, {
            compare,
        });

        expect(compare).toHaveBeenCalledWith(initialValue, nextValue);
        expect(setSpy).toHaveBeenCalledTimes(1);
        expect(await storage.get("settings")).toEqual({theme: "dark"});
    });

    test("custom compare can force a skip for unequal values", async () => {
        await storage.set("settings", {theme: "light"});

        const setSpy = chrome.storage.local.set as jest.Mock;
        setSpy.mockClear();

        await storage.update("settings", () => ({theme: "dark"}), {
            compare: () => true,
        });

        expect(setSpy).not.toHaveBeenCalled();
        expect(await storage.get("settings")).toEqual({theme: "light"});
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

describe("set/get methods with different type of value", () => {
    test.each([
        ["string", "hello"],
        ["number", 42],
        ["boolean", true],
        ["null", null],
        ["undefined", undefined],
        ["object", {a: 1, b: true}],
        ["array", [1, 2, 3]],
    ])("set/get with %s", async (_, value) => {
        await storage.set("key", value);
        const result = await storage.get("key");
        expect(result).toEqual(value);
    });
});

describe("remove method", () => {
    test("deletes the key without namespace", async () => {
        await storage.set("theme", "dark");
        await storage.remove("theme");
        const result = await global.storageLocalGet("theme");
        expect(result).toBeUndefined();
    });

    test("deletes the key with namespace", async () => {
        await storageWithNamespace.set("theme", "dark");
        await storageWithNamespace.remove("theme");
        const result = await global.storageLocalGet("theme", storageWithNamespace);
        expect(result).toBeUndefined();
    });
});

describe("watch method", () => {
    test("calls specific key callback on change", () => {
        const keyCallback = jest.fn();
        storage.watch({theme: keyCallback});

        global.simulateStorageChange({
            storage,
            key: "theme",
            oldValue: "light",
            newValue: "dark",
        });

        expect(keyCallback).toHaveBeenCalledWith("dark", "light");
    });

    test("does not call key callback for unrelated key", () => {
        const keyCallback = jest.fn();
        storage.watch({theme: keyCallback});

        global.simulateStorageChange({
            storage,
            key: "volume",
            oldValue: 50,
            newValue: 80,
        });

        expect(keyCallback).not.toHaveBeenCalled();
    });

    test("calls global callback on any change", () => {
        const globalCallback = jest.fn();
        storage.watch(globalCallback);

        global.simulateStorageChange({
            storage,
            key: "theme",
            oldValue: "light",
            newValue: "dark",
        });
        global.simulateStorageChange({
            storage,
            key: "volume",
            oldValue: 50,
            newValue: 80,
        });

        expect(globalCallback).toHaveBeenCalledWith(80, 50, "volume");
        expect(globalCallback).toHaveBeenCalledWith("dark", "light", "theme");
    });

    test("calls both key and global callbacks", () => {
        const keyCallback = jest.fn();
        const globalCallback = jest.fn();
        storage.watch({theme: keyCallback});
        storage.watch(globalCallback);

        global.simulateStorageChange({
            storage,
            key: "theme",
            oldValue: "light",
            newValue: "dark",
        });
        global.simulateStorageChange({
            storage,
            key: "volume",
            oldValue: 50,
            newValue: 80,
        });

        expect(keyCallback).toHaveBeenCalledWith("dark", "light");
        expect(globalCallback).toHaveBeenCalledWith(80, 50, "volume");
        expect(globalCallback).toHaveBeenCalledWith("dark", "light", "theme");
    });
});

// Static factory methods tests migrated from AbstractStorage.static.test.ts

describe("static factory methods", () => {
    describe("make()", () => {
        test("Storage.make() returns provider by default and MonoStorage with key", async () => {
            const s = Storage.make();
            expect(s).toBeInstanceOf(Storage);

            const mono = Storage.make({key: "bucket"});
            expect(mono).toBeInstanceOf(MonoStorage);

            // default area is local; write and verify stored in local only
            await (s as Storage<any>).set("a" as any, 1 as any);

            const localAll = await getAllFromArea("local");
            expect(localAll["a"]).toBe(1);

            if (hasArea("sync")) {
                const syncAll = await getAllFromArea("sync");
                expect(syncAll["a"]).toBeUndefined();
            }
            if (hasArea("managed")) {
                const managedAll = await getAllFromArea("managed");
                expect(managedAll["a"]).toBeUndefined();
            }
            if (hasArea("session")) {
                const sessionAll = await getAllFromArea("session");
                expect(sessionAll["a"]).toBeUndefined();
            }
        });
    });

    describe("Area shortcuts (Local/Sync/Session/Managed)", () => {
        test("Storage.Local() writes to local area and returns Storage/MonoStorage accordingly", async () => {
            const s = Storage.Local();
            expect(s).toBeInstanceOf(Storage);
            await (s as Storage<any>).set("x" as any, 10 as any);

            const localAll = await getAllFromArea("local");
            expect(localAll["x"]).toBe(10);

            if (hasArea("sync")) {
                const syncAll = await getAllFromArea("sync");
                expect(syncAll["x"]).toBeUndefined();
            }

            const mono = Storage.Local({key: "bucket"});
            expect(mono).toBeInstanceOf(MonoStorage);
            await (mono as unknown as MonoStorage<any, any>).set("a" as any, 1 as any);
            const localAll2 = await getAllFromArea("local");
            expect(localAll2["bucket"]).toEqual({a: 1});
        });

        test("Storage.Sync() writes to sync area", async () => {
            if (!hasArea("sync")) {
                return; // environment doesn't support sync in this mock version
            }
            const s = Storage.Sync();
            expect(s).toBeInstanceOf(Storage);
            await (s as Storage<any>).set("x" as any, 10 as any);

            const syncAll = await getAllFromArea("sync");
            expect(syncAll["x"]).toBe(10);

            const localAll = await getAllFromArea("local");
            expect(localAll["x"]).toBeUndefined();

            const mono = Storage.Sync({key: "bucket"});
            expect(mono).toBeInstanceOf(MonoStorage);
            await (mono as unknown as MonoStorage<any, any>).set("a" as any, 1 as any);
            const syncAll2 = await getAllFromArea("sync");
            expect(syncAll2["bucket"]).toEqual({a: 1});
        });

        test("Storage.Managed() writes to managed area", async () => {
            if (!hasArea("managed")) {
                return;
            }
            const s = Storage.Managed();
            expect(s).toBeInstanceOf(Storage);
            await (s as Storage<any>).set("m" as any, 7 as any);

            const managedAll = await getAllFromArea("managed");
            expect(managedAll["m"]).toBe(7);

            const localAll = await getAllFromArea("local");
            expect(localAll["m"]).toBeUndefined();
        });

        test("Storage.Session() writes to session area if available", async () => {
            if (!hasArea("session")) {
                return;
            }
            const s = Storage.Session();
            expect(s).toBeInstanceOf(Storage);
            await (s as Storage<any>).set("s" as any, 5 as any);

            const sessionAll = await getAllFromArea("session");
            expect(sessionAll["s"]).toBe(5);

            const localAll = await getAllFromArea("local");
            expect(localAll["s"]).toBeUndefined();
        });
    });
});
