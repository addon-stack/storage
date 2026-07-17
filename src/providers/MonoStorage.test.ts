import MonoStorage from "./MonoStorage";
import SecureStorage from "./SecureStorage";
import Storage from "./Storage";
import {StorageCorruptionError} from "../errors";
import {captureUnhandledErrors, flushMacrotask} from "../../tests/helpers/async";

interface BucketState {
    a?: number;
    b?: {x: number} | number | string;
    c?: string;
}

const key = "bucket" as const;

let base: Storage<Record<typeof key, Partial<BucketState>>>;
let secureBase: SecureStorage<Record<typeof key, Partial<BucketState>>>;

beforeEach(async () => {
    global.resetStorageChangeListeners();
    base = new Storage();
    secureBase = new SecureStorage();
    await chrome.storage.local.clear();

    // Patch .get due to jest-webextension-mock limitation on chrome.storage.get(key)
    // Storage: use storageLocalGet to fetch specific key reliably in tests
    const baseGet = base.get.bind(base);
    base.get = (async (k: any) => {
        try {
            // Use helper to accurately read the specific full key from mock storage
            return await (global as any).storageLocalGet(k, base);
        } catch {
            // fallback to original if needed
            return baseGet(k);
        }
    }) as any;

    // SecureStorage: we need decrypted value; derive from getAll() which decrypts
    const secureGet = secureBase.get.bind(secureBase);
    secureBase.get = (async (k: any) => {
        try {
            const all = await secureBase.getAll();
            return (all as any)[k];
        } catch {
            return secureGet(k);
        }
    }) as any;
});

test("constructor validates non-empty key", () => {
    expect(() => new MonoStorage("" as any, base)).toThrow(/non-empty string/);

    expect(() => new MonoStorage<BucketState, typeof key>(key as any, base as any)).not.toThrow();
});

test("set/get basic behavior", async () => {
    const mono = new MonoStorage<BucketState, typeof key>(key, base);
    await mono.set("a", 1);
    await mono.set("c", "hello");

    expect(await mono.get("a")).toBe(1);
    expect(await mono.get("c")).toBe("hello");

    // underlying physical record is a single object under key
    const raw = await (global as any).storageLocalGet(key, base);
    expect(raw).toEqual({a: 1, c: "hello"});
});

test("logical keys containing the namespace separator remain inside the bucket", async () => {
    interface ColonKeyState {
        "feature:enabled"?: number;
    }

    const logicalKey = "feature:enabled" as const;
    const underlying = new Storage<Record<typeof key, Partial<ColonKeyState>>>();
    const mono = new MonoStorage<ColonKeyState, typeof key>(key, underlying);

    await mono.set(logicalKey, 1);
    await expect(mono.get(logicalKey)).resolves.toBe(1);

    await mono.update(logicalKey, previous => (previous ?? 0) + 1);
    await expect(mono.get(logicalKey)).resolves.toBe(2);
    await expect(global.storageLocalGet(key, underlying)).resolves.toEqual({[logicalKey]: 2});

    await mono.remove(logicalKey);
    await expect(mono.get(logicalKey)).resolves.toBeUndefined();
    await expect(global.storageLocalGet(key, underlying)).resolves.toBeUndefined();
});

test("set performs a physical bucket write even when the value is deeply equal", async () => {
    const mono = new MonoStorage<BucketState, typeof key>(key, base);
    await mono.set("b", {x: 1});

    const setSpy = chrome.storage.local.set as jest.Mock;
    setSpy.mockClear();

    await mono.set("b", {x: 1});

    expect(setSpy).toHaveBeenCalledTimes(1);
    expect(setSpy).toHaveBeenCalledWith({bucket: {b: {x: 1}}}, expect.any(Function));
});

test("set rejects undefined and non-plain batch containers before touching the bucket", async () => {
    const mono = new MonoStorage<BucketState, typeof key>(key, base);
    const getSpy = chrome.storage.local.get as jest.Mock;
    const setSpy = chrome.storage.local.set as jest.Mock;
    getSpy.mockClear();
    setSpy.mockClear();

    await expect(mono.set({a: undefined})).rejects.toThrow(TypeError);
    await expect((mono.set as (value: unknown) => Promise<void>)("a")).rejects.toThrow(TypeError);

    expect(getSpy).not.toHaveBeenCalled();
    expect(setSpy).not.toHaveBeenCalled();
});

test("batch set snapshots getter values once before locking the bucket", async () => {
    const mono = new MonoStorage<BucketState, typeof key>(key, base);
    const values: Partial<BucketState> = {};
    let reads = 0;

    Object.defineProperty(values, "a", {
        enumerable: true,
        get: () => {
            reads += 1;
            return reads === 1 ? 1 : undefined;
        },
    });

    await mono.set(values);

    expect(reads).toBe(1);
    await expect(mono.get("a")).resolves.toBe(1);
});

test("a prototype-like physical bucket key is absent until it is explicitly stored", async () => {
    const prototypeKey = "toString" as const;
    const underlying = new Storage<Record<typeof prototypeKey, Partial<BucketState>>>();
    const mono = new MonoStorage<BucketState, typeof prototypeKey>(prototypeKey, underlying);

    await expect(mono.get("a")).resolves.toBeUndefined();
    await mono.set("a", 1);
    await expect(mono.get("a")).resolves.toBe(1);
});

describe("batch overloads", () => {
    test("batch set writes one namespaced physical bucket and batch get reads it once", async () => {
        const underlying = new Storage<Record<typeof key, Partial<BucketState>>>({namespace: "feature"});
        const mono = new MonoStorage<BucketState, typeof key>(key, underlying);
        const setSpy = chrome.storage.local.set as jest.Mock;
        setSpy.mockClear();

        await mono.set({a: 1, b: 2, c: "ready"});

        expect(setSpy).toHaveBeenCalledTimes(1);
        expect(setSpy).toHaveBeenCalledWith(
            {"feature:bucket": {a: 1, b: 2, c: "ready"}},
            expect.any(Function)
        );

        const getSpy = chrome.storage.local.get as jest.Mock;
        getSpy.mockClear();

        await expect(mono.get(["a", "c"] as const)).resolves.toEqual({a: 1, c: "ready"});
        expect(getSpy).toHaveBeenCalledTimes(1);
        expect(getSpy).toHaveBeenCalledWith("feature:bucket", expect.any(Function));
    });

    test("batch update applies changed, equal, and deleted inner keys in one physical write", async () => {
        const underlying = new Storage<Record<typeof key, Partial<BucketState>>>();
        const mono = new MonoStorage<BucketState, typeof key>(key, underlying);
        await mono.set({a: 1, b: 2, c: "old"});

        const setSpy = chrome.storage.local.set as jest.Mock;
        const removeSpy = chrome.storage.local.remove as jest.Mock;
        setSpy.mockClear();
        removeSpy.mockClear();

        const result = await mono.update(["a", "b", "c"] as const, () => ({
            a: undefined,
            b: 2,
            c: "new",
        }));

        expect(result).toEqual({b: 2, c: "new"});
        expect(setSpy).toHaveBeenCalledTimes(1);
        expect(setSpy).toHaveBeenCalledWith({bucket: {b: 2, c: "new"}}, expect.any(Function));
        expect(removeSpy).not.toHaveBeenCalled();
        expect(await mono.getAll()).toEqual({b: 2, c: "new"});
    });

    test("batch update removes the physical bucket once when the final state is empty", async () => {
        const underlying = new Storage<Record<typeof key, Partial<BucketState>>>();
        const mono = new MonoStorage<BucketState, typeof key>(key, underlying);
        await mono.set({a: 1, c: "old"});

        const setSpy = chrome.storage.local.set as jest.Mock;
        const removeSpy = chrome.storage.local.remove as jest.Mock;
        setSpy.mockClear();
        removeSpy.mockClear();

        const result = await mono.update(["a", "c"] as const, () => ({a: undefined, c: undefined}));

        expect(result).toEqual({});
        expect(setSpy).not.toHaveBeenCalled();
        expect(removeSpy).toHaveBeenCalledTimes(1);
        expect(removeSpy).toHaveBeenCalledWith("bucket", expect.any(Function));
    });

    test("batch update applies per-key comparers before deciding whether to write the bucket", async () => {
        const underlying = new Storage<Record<typeof key, Partial<BucketState>>>();
        const mono = new MonoStorage<BucketState, typeof key>(key, underlying);
        await mono.set({a: 1, b: 2});

        const compareA = jest.fn(() => true);
        const compareB = jest.fn(() => false);
        const setSpy = chrome.storage.local.set as jest.Mock;
        setSpy.mockClear();

        const result = await mono.update(
            ["a", "b"] as const,
            () => ({a: 2, b: 2}),
            {compare: {a: compareA, b: compareB}}
        );

        expect(compareA).toHaveBeenCalledWith(1, 2);
        expect(compareB).toHaveBeenCalledWith(2, 2);
        expect(result).toEqual({a: 1, b: 2});
        expect(setSpy).toHaveBeenCalledTimes(1);
        expect(setSpy).toHaveBeenCalledWith({bucket: {a: 1, b: 2}}, expect.any(Function));
    });

    test("batch update rejects unrequested keys without changing the bucket", async () => {
        const underlying = new Storage<Record<typeof key, Partial<BucketState>>>();
        const mono = new MonoStorage<BucketState, typeof key>(key, underlying);
        await mono.set({a: 1});

        const setSpy = chrome.storage.local.set as jest.Mock;
        const removeSpy = chrome.storage.local.remove as jest.Mock;
        setSpy.mockClear();
        removeSpy.mockClear();

        await expect(
            mono.update(["a"] as const, () => ({b: 2}) as unknown as Partial<Pick<BucketState, "a">>)
        ).rejects.toThrow("unrequested key");

        expect(setSpy).not.toHaveBeenCalled();
        expect(removeSpy).not.toHaveBeenCalled();
        expect(await mono.getAll()).toEqual({a: 1});
    });

    test("empty batch operations do not read, lock, or write the physical bucket", async () => {
        const underlying = new Storage<Record<typeof key, Partial<BucketState>>>();
        const mono = new MonoStorage<BucketState, typeof key>(key, underlying);
        const updater = jest.fn(() => ({}));
        const getSpy = chrome.storage.local.get as jest.Mock;
        const setSpy = chrome.storage.local.set as jest.Mock;
        const removeSpy = chrome.storage.local.remove as jest.Mock;
        getSpy.mockClear();
        setSpy.mockClear();
        removeSpy.mockClear();

        await expect(mono.get([])).resolves.toEqual({});
        await expect(mono.set({})).resolves.toBeUndefined();
        await expect(mono.update([], updater)).resolves.toEqual({});
        await expect(mono.remove([])).resolves.toBeUndefined();

        expect(updater).not.toHaveBeenCalled();
        expect(getSpy).not.toHaveBeenCalled();
        expect(setSpy).not.toHaveBeenCalled();
        expect(removeSpy).not.toHaveBeenCalled();
    });

    test("batch update serializes concurrent bucket batches", async () => {
        const underlying = new Storage<Record<typeof key, Partial<BucketState>>>();
        const mono = new MonoStorage<BucketState, typeof key>(key, underlying);
        await mono.set({a: 0, b: 0});

        await Promise.all([
            mono.update(["a", "b"] as const, async prev => {
                await new Promise(resolve => setTimeout(resolve, 10));
                return {a: (prev.a ?? 0) + 1, b: Number(prev.b ?? 0) + 1};
            }),
            mono.update(["b", "a"] as const, async prev => {
                await new Promise(resolve => setTimeout(resolve, 10));
                return {a: (prev.a ?? 0) + 1, b: Number(prev.b ?? 0) + 1};
            }),
        ]);

        expect(await mono.get(["a", "b"] as const)).toEqual({a: 2, b: 2});
    });

    test("removing a missing logical key does not create an empty bucket", async () => {
        const mono = new MonoStorage<BucketState, typeof key>(key, base);
        const setSpy = chrome.storage.local.set as jest.Mock;
        const removeSpy = chrome.storage.local.remove as jest.Mock;
        setSpy.mockClear();
        removeSpy.mockClear();

        await mono.remove("a");

        expect(setSpy).not.toHaveBeenCalled();
        expect(removeSpy).not.toHaveBeenCalled();
        expect(await (global as any).storageLocalGet(key, base)).toBeUndefined();
    });

    test("single update comparer can force a deeply-equal physical write", async () => {
        const mono = new MonoStorage<BucketState, typeof key>(key, base);
        await mono.set("b", {x: 1});
        const setSpy = chrome.storage.local.set as jest.Mock;
        setSpy.mockClear();

        await mono.update("b", previous => ({...(previous as {x: number})}), {compare: () => false});

        expect(setSpy).toHaveBeenCalledTimes(1);
    });
});

test("update serializes concurrent bucket mutations", async () => {
    const mono = new MonoStorage<BucketState, typeof key>(key, base);

    await mono.set("a", 0);

    await Promise.all([
        mono.update("a", async prev => {
            await new Promise(resolve => setTimeout(resolve, 10));
            return (prev ?? 0) + 1;
        }),
        mono.update("a", async prev => {
            await new Promise(resolve => setTimeout(resolve, 10));
            return (prev ?? 0) + 1;
        }),
    ]);

    expect(await mono.get("a")).toBe(2);
});

test("update skips physical bucket write when inner value is equal", async () => {
    const mono = new MonoStorage<BucketState, typeof key>(key, base);
    await mono.set("b", {x: 1});

    const setSpy = chrome.storage.local.set as jest.Mock;
    setSpy.mockClear();

    await mono.update("b", prev => (prev && typeof prev === "object" ? {...prev} : {x: 1}));

    expect(setSpy).not.toHaveBeenCalled();
    expect(await mono.getAll()).toEqual({b: {x: 1}});
});

test("update skips physical bucket write when deleting an absent inner key", async () => {
    const mono = new MonoStorage<BucketState, typeof key>(key, base);
    await mono.set("a", 1);

    const setSpy = chrome.storage.local.set as jest.Mock;
    const removeSpy = chrome.storage.local.remove as jest.Mock;
    setSpy.mockClear();
    removeSpy.mockClear();

    await mono.update("c", () => undefined);

    expect(setSpy).not.toHaveBeenCalled();
    expect(removeSpy).not.toHaveBeenCalled();
    expect(await mono.getAll()).toEqual({a: 1});
});

test("update writes the physical bucket when inner value changes", async () => {
    const mono = new MonoStorage<BucketState, typeof key>(key, base);
    await mono.set("a", 1);

    const setSpy = chrome.storage.local.set as jest.Mock;
    setSpy.mockClear();

    await mono.update("a", prev => (prev ?? 0) + 1);

    expect(setSpy).toHaveBeenCalledTimes(1);
    expect(await mono.getAll()).toEqual({a: 2});
});

test("getAll returns the whole bucket", async () => {
    const mono = new MonoStorage<BucketState, typeof key>(key, base);
    await mono.set("a", 1);
    await mono.set("b", {x: 2});

    expect(await mono.getAll()).toEqual({a: 1, b: {x: 2}});
});

test("update(undefined) deletes key and removes physical entry when empty", async () => {
    const mono = new MonoStorage<BucketState, typeof key>(key, base);
    await mono.set("a", 1);
    await mono.set("b", 2);

    await mono.update("a", () => undefined);
    expect(await mono.get("a")).toBeUndefined();
    let raw = await (global as any).storageLocalGet(key, base);
    expect(raw).toEqual({b: 2});

    await mono.update("b", () => undefined);
    // physical key should be removed entirely
    raw = await (global as any).storageLocalGet(key, base);
    expect(raw).toBeUndefined();
});

test("remove single and multiple keys; remove physical when bucket empty", async () => {
    const mono = new MonoStorage<BucketState, typeof key>(key, base);
    await mono.set("a", 1);
    await mono.set("b", 2);
    await mono.set("c", "z");

    await mono.remove("b");
    expect(await mono.getAll()).toEqual({a: 1, c: "z"});

    await mono.remove(["a", "c"]);
    const raw = await (global as any).storageLocalGet(key, base);
    expect(raw).toBeUndefined();
});

test("clear removes the physical key", async () => {
    const mono = new MonoStorage<BucketState, typeof key>(key, base);
    await mono.set("a", 1);
    await mono.set("b", 2);

    await mono.clear();
    const raw = await (global as any).storageLocalGet(key, base);
    expect(raw).toBeUndefined();
    expect(await mono.getAll()).toEqual({});
});

describe("watch and subscribe", () => {
    test("subscribe emits one change map for one physical bucket event", async () => {
        const underlying = new Storage<Record<typeof key, Partial<BucketState>>>();
        const mono = new MonoStorage<BucketState, typeof key>(key, underlying);
        const callback = jest.fn();
        const unsubscribe = mono.subscribe(callback);

        global.simulateStorageChange({
            storage: underlying,
            key,
            oldValue: {a: 1, b: {x: 1}},
            newValue: {a: 2, b: {x: 1}, c: "created"},
        });

        await flushMacrotask();

        expect(callback).toHaveBeenCalledTimes(1);
        expect(callback).toHaveBeenCalledWith({
            a: {oldValue: 1, newValue: 2},
            c: {oldValue: undefined, newValue: "created"},
        });

        unsubscribe();
    });

    test("global callback is called per changed inner key and provides the key", async () => {
        const mono = new MonoStorage<BucketState, typeof key>(key, base);
        const cb = jest.fn();
        mono.watch(cb);

        // simulate change on underlying storage physical key
        (global as any).simulateStorageChange({
            storage: base,
            key,
            oldValue: {a: 1},
            newValue: {a: 2, c: "x"},
        });

        await flushMacrotask();

        expect(cb).toHaveBeenCalledWith(2, 1, "a");
        expect(cb).toHaveBeenCalledWith("x", undefined, "c");
    });

    test("keyed callbacks fan-out only on changed keys", async () => {
        const mono = new MonoStorage<BucketState, typeof key>(key, base);
        const cbA = jest.fn();
        const cbB = jest.fn();
        const cbC = jest.fn();
        mono.watch({a: cbA, b: cbB, c: cbC});

        (global as any).simulateStorageChange({
            storage: base,
            key,
            oldValue: {a: 1, b: 2},
            newValue: {a: 3, b: 2, c: "x"},
        });

        await flushMacrotask();

        expect(cbA).toHaveBeenCalledWith(3, 1); // changed
        expect(cbB).not.toHaveBeenCalled(); // unchanged
        expect(cbC).toHaveBeenCalledWith("x", undefined); // added
    });

    test("shallowEqual prevents notifications for equal objects", async () => {
        const mono = new MonoStorage<BucketState, typeof key>(key, base);
        const cbB = jest.fn();
        mono.watch({b: cbB});

        (global as any).simulateStorageChange({
            storage: base,
            key,
            oldValue: {b: {x: 1}},
            newValue: {b: {x: 1}}, // shallowly equal
        });

        await flushMacrotask();

        expect(cbB).not.toHaveBeenCalled();
    });

    test("subscriber rejection is uncaught without disposing the Mono subscription", async () => {
        const mono = new MonoStorage<BucketState, typeof key>(key, base);
        const errors = captureUnhandledErrors();
        const callback = jest.fn().mockRejectedValueOnce(new Error("subscriber failed")).mockResolvedValue(undefined);
        const unsubscribe = mono.subscribe(callback);

        try {
            global.simulateStorageChange({storage: base, key, oldValue: {a: 1}, newValue: {a: 2}});
            await flushMacrotask();

            expect(callback).toHaveBeenCalledTimes(1);
            expect(errors.pending).toBe(1);
            expect(() => errors.runNext()).toThrow("subscriber failed");

            global.simulateStorageChange({storage: base, key, oldValue: {a: 2}, newValue: {a: 3}});
            await flushMacrotask();
            expect(callback).toHaveBeenCalledTimes(2);
        } finally {
            unsubscribe();
            errors.restore();
        }
    });

    test("a corrupted bucket terminates the Mono subscription", async () => {
        const mono = new MonoStorage<BucketState, typeof key>(key, base);
        const errors = captureUnhandledErrors();
        const callback = jest.fn();
        mono.subscribe(callback);

        try {
            global.simulateStorageChange({storage: base, key, oldValue: {a: 1}, newValue: []});
            await flushMacrotask();

            expect(callback).not.toHaveBeenCalled();
            expect(errors.pending).toBe(1);
            expect(() => errors.runNext()).toThrow(StorageCorruptionError);

            global.simulateStorageChange({storage: base, key, oldValue: {a: 1}, newValue: {a: 2}});
            await flushMacrotask();
            expect(callback).not.toHaveBeenCalled();
        } finally {
            errors.restore();
        }
    });
});

describe("corrupted buckets", () => {
    test.each([null, "invalid", [], 42])("rejects a present non-record bucket %#", async bucket => {
        const mono = new MonoStorage<BucketState, typeof key>(key, base);
        await chrome.storage.local.set({[key]: bucket});

        await expect(mono.getAll()).rejects.toBeInstanceOf(StorageCorruptionError);
        await expect(mono.set("a", 1)).rejects.toBeInstanceOf(StorageCorruptionError);
        await expect(mono.update("a", () => 1)).rejects.toBeInstanceOf(StorageCorruptionError);
        await expect(mono.remove("a")).rejects.toBeInstanceOf(StorageCorruptionError);
    });

    test("clear removes a corrupted encrypted bucket without decrypting it", async () => {
        const mono = new MonoStorage<BucketState, typeof key>(key, secureBase as any);
        const fullKey = (secureBase as any).getFullKey(key);
        await chrome.storage.local.set({[fullKey]: "corrupted:bucket"});
        const decryptSpy = crypto.subtle.decrypt as jest.Mock;
        decryptSpy.mockClear();

        await mono.clear();

        expect(await (global as any).storageLocalGet(key, secureBase)).toBeUndefined();
        expect(decryptSpy).not.toHaveBeenCalled();
    });
});

test("works with SecureStorage as underlying provider", async () => {
    const mono = new MonoStorage<BucketState, typeof key>(key, secureBase as any);

    await mono.set("a", 1);
    await mono.set("c", "sec");

    expect(await mono.get("a")).toBe(1);
    expect(await mono.get("c")).toBe("sec");

    const raw = await (global as any).storageLocalGet(key, secureBase);
    expect(typeof raw).toBe("string");
    const allRaw = await chrome.storage.local.get(null);
    expect(typeof allRaw["secure::bucket"]).toBe("string");
    expect(allRaw["secure:bucket"]).toBeUndefined();

    const decryptedAll = await secureBase.getAll();
    expect(decryptedAll[key]).toEqual({a: 1, c: "sec"});
});
