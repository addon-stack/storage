import MonoStorage from "./MonoStorage";
import Storage from "./Storage";

import {captureUnhandledErrors, flushMacrotask} from "../../tests/helpers/async";
import {StoragePartialUpdateError} from "../errors";

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

interface BatchState {
    a?: number;
    b?: number;
    c?: string;
    missing?: boolean;
}

interface PrototypeKeyState {
    __proto__?: string;
    safe?: string;
}

interface PrototypeNamedState {
    constructor?: string;
    toString?: string;
    valueOf?: string;
}

interface SeparatorState {
    good?: string;
    "bad:key"?: string;
    "user:profile"?: string;
}

beforeEach(async () => {
    global.resetStorageChangeListeners();
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
        "Lock-coordinated storage update is unavailable: Web Locks API is not supported in this context."
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

        const result = await storage.update("settings", () => ({theme: "dark"}), {
            compare: () => true,
        });

        expect(result).toEqual({theme: "light"});
        expect(setSpy).not.toHaveBeenCalled();
        expect(await storage.get("settings")).toEqual({theme: "light"});
    });
});

describe("batch overloads", () => {
    test("batch get reads requested namespaced keys in one native call and omits missing values", async () => {
        const isolatedStorage = new Storage<BatchState>({namespace: "batch"});

        await chrome.storage.local.set({
            "batch:a": 1,
            "batch:b": 2,
            "other:a": 99,
        });

        const getSpy = chrome.storage.local.get as jest.Mock;
        getSpy.mockClear();

        const result = await isolatedStorage.get(["a", "b", "missing"] as const);

        expect(result).toEqual({a: 1, b: 2});
        expect(getSpy).toHaveBeenCalledTimes(1);
        expect(getSpy).toHaveBeenCalledWith(["batch:a", "batch:b", "batch:missing"], expect.any(Function));
    });

    test("batch maps preserve a storage key named __proto__ without prototype mutation", async () => {
        const isolatedStorage = new Storage<PrototypeKeyState>();

        await isolatedStorage.set({["__proto__"]: "stored", safe: "ok"});

        const values = await isolatedStorage.get(["__proto__", "safe"] as const);
        expect(Object.getPrototypeOf(values)).toBe(Object.prototype);
        expect(Object.getOwnPropertyDescriptor(values, "__proto__")?.value).toBe("stored");
        expect(values.safe).toBe("ok");

        const updated = await isolatedStorage.update(["__proto__", "safe"] as const, prev => ({
            ["__proto__"]: `${prev.__proto__}:updated`,
        }));

        expect(Object.getPrototypeOf(updated)).toBe(Object.prototype);
        expect(Object.getOwnPropertyDescriptor(updated, "__proto__")?.value).toBe("stored:updated");
        expect(updated.safe).toBe("ok");

        const callback = jest.fn();
        const unsubscribe = isolatedStorage.subscribe(callback);

        global.simulateStorageChanges({
            storage: isolatedStorage,
            changes: {["__proto__"]: {oldValue: "stored", newValue: "stored:updated"}},
        });

        await flushMacrotask();

        expect(callback).toHaveBeenCalledTimes(1);
        const changes = callback.mock.calls[0]?.[0];
        expect(Object.getPrototypeOf(changes)).toBe(Object.prototype);

        expect(Object.getOwnPropertyDescriptor(changes, "__proto__")?.value).toEqual({
            oldValue: "stored",
            newValue: "stored:updated",
        });

        unsubscribe();
    });

    test("batch set writes namespaced values in one native call without Web Locks", async () => {
        Object.defineProperty(globalThis.navigator, "locks", {
            value: undefined,
            writable: true,
            enumerable: true,
            configurable: true,
        });

        const isolatedStorage = new Storage<BatchState>({namespace: "batch"});
        const setSpy = chrome.storage.local.set as jest.Mock;
        setSpy.mockClear();

        await isolatedStorage.set({a: 1, b: 2, c: "ready"});

        expect(setSpy).toHaveBeenCalledTimes(1);

        expect(setSpy).toHaveBeenCalledWith(
            {"batch:a": 1, "batch:b": 2, "batch:c": "ready"},
            expect.any(Function)
        );

        expect(await global.storageLocalGet(["a", "b", "c"], isolatedStorage)).toEqual({
            "batch:a": 1,
            "batch:b": 2,
            "batch:c": "ready",
        });
    });

    test("set overload rejects a two-argument undefined value before a native write", async () => {
        const isolatedStorage = new Storage<BatchState>({namespace: "batch"});
        const setSpy = chrome.storage.local.set as jest.Mock;
        setSpy.mockClear();

        await expect(isolatedStorage.set("a", undefined as never)).rejects.toThrow(TypeError);

        expect(setSpy).not.toHaveBeenCalled();
    });

    test("batch set rejects undefined values before a native write", async () => {
        const isolatedStorage = new Storage<BatchState>({namespace: "batch"});
        const setSpy = chrome.storage.local.set as jest.Mock;
        setSpy.mockClear();

        await expect(isolatedStorage.set({a: undefined})).rejects.toThrow(TypeError);

        expect(setSpy).not.toHaveBeenCalled();
    });

    test.each(["theme", null, [], new Date(), new Map(), () => undefined, new (class Value {})()])(
        "batch set rejects a non-plain object container %#",
        async values => {
            const isolatedStorage = new Storage<BatchState>();
            const setSpy = chrome.storage.local.set as jest.Mock;
            setSpy.mockClear();

            await expect((isolatedStorage.set as (value: unknown) => Promise<void>)(values)).rejects.toThrow(
                TypeError
            );

            expect(setSpy).not.toHaveBeenCalled();
        }
    );

    test("batch set accepts a null-prototype object", async () => {
        const isolatedStorage = new Storage<BatchState>();
        const values = Object.create(null) as Partial<BatchState>;
        values.a = 1;

        await isolatedStorage.set(values);

        await expect(isolatedStorage.get("a")).resolves.toBe(1);
    });

    test("batch set snapshots getter values once before native I/O", async () => {
        const isolatedStorage = new Storage<BatchState>();
        const values: Partial<BatchState> = {};
        let reads = 0;

        Object.defineProperty(values, "a", {
            enumerable: true,
            get: () => {
                reads += 1;

                return reads === 1 ? 1 : undefined;
            },
        });

        await isolatedStorage.set(values);

        expect(reads).toBe(1);
        await expect(isolatedStorage.get("a")).resolves.toBe(1);
    });

    test("missing prototype-like keys stay absent and batch updater snapshots do not inherit them", async () => {
        const isolatedStorage = new Storage<PrototypeNamedState>();

        const compare = jest.fn((prev: Partial<PrototypeNamedState>, next: Partial<PrototypeNamedState>) => {
            expect(Object.getPrototypeOf(prev)).toBeNull();
            expect(Object.getPrototypeOf(next)).toBeNull();
            expect(prev.constructor).toBeUndefined();
            expect(prev.toString).toBeUndefined();
            expect(prev.valueOf).toBeUndefined();
            expect(next.constructor).toBeUndefined();
            expect(next.toString).toBe("stored");
            expect(next.valueOf).toBeUndefined();

            return false;
        });

        await expect(isolatedStorage.get("toString")).resolves.toBeUndefined();

        const values = await isolatedStorage.get(["constructor", "toString", "valueOf"] as const);
        expect(Object.keys(values)).toEqual([]);

        await isolatedStorage.update(
            ["constructor", "toString", "valueOf"] as const,
            prev => {
                expect(Object.getPrototypeOf(prev)).toBeNull();
                expect(prev.constructor).toBeUndefined();
                expect(prev.toString).toBeUndefined();
                expect(prev.valueOf).toBeUndefined();

                const patch = Object.create(null) as Partial<PrototypeNamedState>;
                patch.toString = "stored";

                return patch;
            },
            {compare}
        );

        expect(compare).toHaveBeenCalledTimes(1);
        await expect(isolatedStorage.get("toString")).resolves.toBe("stored");
    });

    test("batch update writes only changed values using one snapshot and one native set", async () => {
        const isolatedStorage = new Storage<BatchState>({namespace: "batch"});
        await isolatedStorage.set({a: 1, b: 2});

        const getSpy = chrome.storage.local.get as jest.Mock;
        const setSpy = chrome.storage.local.set as jest.Mock;
        const removeSpy = chrome.storage.local.remove as jest.Mock;
        getSpy.mockClear();
        setSpy.mockClear();
        removeSpy.mockClear();

        const updater = jest.fn((prev: Partial<Pick<BatchState, "a" | "b" | "c">>) => ({
            a: (prev.a ?? 0) + 1,
            b: 2,
            c: "created",
        }));

        const result = await isolatedStorage.update(["a", "b", "c"] as const, updater);

        expect(updater).toHaveBeenCalledTimes(1);
        expect(updater).toHaveBeenCalledWith({a: 1, b: 2});
        expect(result).toEqual({a: 2, b: 2, c: "created"});
        expect(getSpy).toHaveBeenCalledTimes(1);
        expect(getSpy).toHaveBeenCalledWith(["batch:a", "batch:b", "batch:c"], expect.any(Function));
        expect(setSpy).toHaveBeenCalledTimes(1);
        expect(setSpy).toHaveBeenCalledWith({"batch:a": 2, "batch:c": "created"}, expect.any(Function));
        expect(removeSpy).not.toHaveBeenCalled();
    });

    test("batch update applies mixed writes before removals and returns the final snapshot", async () => {
        const isolatedStorage = new Storage<BatchState>({namespace: "batch"});
        await isolatedStorage.set({a: 1, b: 2});

        const setSpy = chrome.storage.local.set as jest.Mock;
        const removeSpy = chrome.storage.local.remove as jest.Mock;
        setSpy.mockClear();
        removeSpy.mockClear();

        const result = await isolatedStorage.update(["a", "b"] as const, () => ({a: undefined, b: 3}));

        expect(result).toEqual({b: 3});
        expect(setSpy).toHaveBeenCalledTimes(1);
        expect(setSpy).toHaveBeenCalledWith({"batch:b": 3}, expect.any(Function));
        expect(removeSpy).toHaveBeenCalledTimes(1);
        expect(removeSpy).toHaveBeenCalledWith(["batch:a"], expect.any(Function));
        expect(setSpy.mock.invocationCallOrder[0]).toBeLessThan(removeSpy.mock.invocationCallOrder[0]);
    });

    test("batch update reports a partial commit when remove fails after set", async () => {
        class FailingRemoveStorage extends Storage<BatchState> {
            protected override async removeUnlocked(): Promise<void> {
                throw new Error("remove failed");
            }
        }

        const isolatedStorage = new FailingRemoveStorage();
        await isolatedStorage.set({a: 1, b: 2});

        await expect(
            isolatedStorage.update(["a", "b"] as const, () => ({a: undefined, b: 3}))
        ).rejects.toMatchObject({
            name: "StoragePartialUpdateError",
            appliedSetKeys: ["b"],
            attemptedRemoveKeys: ["a"],
            cause: expect.objectContaining({message: "remove failed"}),
        } satisfies Partial<StoragePartialUpdateError<BatchState>>);

        await expect(isolatedStorage.get(["a", "b"] as const)).resolves.toEqual({a: 1, b: 3});
    });

    test("batch update rejects patch keys outside the requested set without writing", async () => {
        const isolatedStorage = new Storage<BatchState>();
        await isolatedStorage.set({a: 1});

        const setSpy = chrome.storage.local.set as jest.Mock;
        const removeSpy = chrome.storage.local.remove as jest.Mock;
        setSpy.mockClear();
        removeSpy.mockClear();

        await expect(
            isolatedStorage.update(
                ["a"] as const,
                () => ({b: 2}) as unknown as Partial<Pick<BatchState, "a">>
            )
        ).rejects.toThrow();

        expect(setSpy).not.toHaveBeenCalled();
        expect(removeSpy).not.toHaveBeenCalled();
        expect(await isolatedStorage.get(["a", "b"] as const)).toEqual({a: 1});
    });

    test.each([new Date(), new Map(), new (class Patch {})()])(
        "batch update rejects a non-plain patch %# without writing",
        async patch => {
            const isolatedStorage = new Storage<BatchState>();
            const setSpy = chrome.storage.local.set as jest.Mock;
            const removeSpy = chrome.storage.local.remove as jest.Mock;
            setSpy.mockClear();
            removeSpy.mockClear();

            await expect(
                isolatedStorage.update(["a"] as const, () => patch as Partial<Pick<BatchState, "a">>)
            ).rejects.toThrow(TypeError);

            expect(setSpy).not.toHaveBeenCalled();
            expect(removeSpy).not.toHaveBeenCalled();
        }
    );

    test("batch update does not write when the updater throws", async () => {
        const isolatedStorage = new Storage<BatchState>();
        await isolatedStorage.set({a: 1, b: 2});

        const setSpy = chrome.storage.local.set as jest.Mock;
        const removeSpy = chrome.storage.local.remove as jest.Mock;
        setSpy.mockClear();
        removeSpy.mockClear();

        await expect(
            isolatedStorage.update(["a", "b"] as const, async () => {
                throw new Error("batch failed");
            })
        ).rejects.toThrow("batch failed");

        expect(setSpy).not.toHaveBeenCalled();
        expect(removeSpy).not.toHaveBeenCalled();
        expect(await isolatedStorage.get(["a", "b"] as const)).toEqual({a: 1, b: 2});
    });

    test("batch update skips native writes for an empty or equal patch", async () => {
        const isolatedStorage = new Storage<BatchState>();
        await isolatedStorage.set({a: 1, b: 2});

        const setSpy = chrome.storage.local.set as jest.Mock;
        const removeSpy = chrome.storage.local.remove as jest.Mock;
        setSpy.mockClear();
        removeSpy.mockClear();

        await expect(isolatedStorage.update(["a", "b"] as const, () => ({}))).resolves.toEqual({a: 1, b: 2});

        await expect(isolatedStorage.update(["a", "b"] as const, () => ({a: 1, b: 2}))).resolves.toEqual({
            a: 1,
            b: 2,
        });

        expect(setSpy).not.toHaveBeenCalled();
        expect(removeSpy).not.toHaveBeenCalled();
    });

    test("aggregate comparer can skip the whole mixed patch and returns the stored snapshot", async () => {
        const isolatedStorage = new Storage<BatchState>();
        await isolatedStorage.set({a: 1, b: 2});

        const compare = jest.fn(() => true);
        const setSpy = chrome.storage.local.set as jest.Mock;
        const removeSpy = chrome.storage.local.remove as jest.Mock;
        setSpy.mockClear();
        removeSpy.mockClear();

        const result = await isolatedStorage.update(
            ["a", "b"] as const,
            () => ({a: undefined, b: 3}),
            {compare}
        );

        expect(compare).toHaveBeenCalledTimes(1);
        expect(compare).toHaveBeenCalledWith({a: 1, b: 2}, {b: 3});
        expect(result).toEqual({a: 1, b: 2});
        expect(setSpy).not.toHaveBeenCalled();
        expect(removeSpy).not.toHaveBeenCalled();
    });

    test("aggregate comparer can force every explicit value to be written", async () => {
        const isolatedStorage = new Storage<BatchState>();
        await isolatedStorage.set({a: 1, b: 2});

        const compare = jest.fn(() => false);
        const setSpy = chrome.storage.local.set as jest.Mock;
        setSpy.mockClear();

        const result = await isolatedStorage.update(
            ["a", "b"] as const,
            () => ({a: 1, b: 3}),
            {compare}
        );

        expect(compare).toHaveBeenCalledTimes(1);
        expect(compare).toHaveBeenCalledWith({a: 1, b: 2}, {a: 1, b: 3});
        expect(result).toEqual({a: 1, b: 3});
        expect(setSpy).toHaveBeenCalledTimes(1);
        expect(setSpy).toHaveBeenCalledWith({a: 1, b: 3}, expect.any(Function));
    });

    test("aggregate comparer errors before any native write", async () => {
        const isolatedStorage = new Storage<BatchState>();
        await isolatedStorage.set({a: 1, b: 2});

        const setSpy = chrome.storage.local.set as jest.Mock;
        const removeSpy = chrome.storage.local.remove as jest.Mock;
        setSpy.mockClear();
        removeSpy.mockClear();

        await expect(
            isolatedStorage.update(["a", "b"] as const, () => ({a: undefined, b: 3}), {
                compare: () => {
                    throw new Error("compare failed");
                },
            })
        ).rejects.toThrow("compare failed");

        expect(setSpy).not.toHaveBeenCalled();
        expect(removeSpy).not.toHaveBeenCalled();
        await expect(isolatedStorage.get(["a", "b"] as const)).resolves.toEqual({a: 1, b: 2});
    });

    test("batch update deduplicates and sorts lock keys while forwarding lock options", async () => {
        const requests: Array<{name: string; options: any}> = [];

        const locker: StorageLocker = {
            async request(name, task, options) {
                requests.push({name, options});

                return await task();
            },
        };

        const isolatedStorage = new Storage<BatchState>({namespace: "batch", locker});
        const controller = new AbortController();

        await isolatedStorage.update(["b", "a", "b"] as const, () => ({a: 1, b: 2}), {
            signal: controller.signal,
            timeout: 25,
        });

        expect(requests).toEqual([
            {name: "batch:a", options: {signal: controller.signal, timeout: 25}},
            {name: "batch:b", options: {signal: controller.signal, timeout: 25}},
        ]);
    });

    test("batch update serializes batches with overlapping keys regardless of key order", async () => {
        const isolatedStorage = new Storage<BatchState>();
        await isolatedStorage.set({a: 0, b: 0});

        await Promise.all([
            isolatedStorage.update(["a", "b"] as const, async prev => {
                await new Promise(resolve => setTimeout(resolve, 10));

                return {a: (prev.a ?? 0) + 1, b: (prev.b ?? 0) + 1};
            }),
            isolatedStorage.update(["b", "a"] as const, async prev => {
                await new Promise(resolve => setTimeout(resolve, 10));

                return {a: (prev.a ?? 0) + 1, b: (prev.b ?? 0) + 1};
            }),
        ]);

        expect(await isolatedStorage.get(["a", "b"] as const)).toEqual({a: 2, b: 2});
    });

    test("batch update coordinates with a single-key update on an overlapping key", async () => {
        const isolatedStorage = new Storage<BatchState>();
        await isolatedStorage.set({a: 0, b: 0});

        await Promise.all([
            isolatedStorage.update(["a", "b"] as const, async prev => {
                await new Promise(resolve => setTimeout(resolve, 10));

                return {a: (prev.a ?? 0) + 1, b: (prev.b ?? 0) + 1};
            }),
            isolatedStorage.update("b", async prev => {
                await new Promise(resolve => setTimeout(resolve, 5));

                return (prev ?? 0) + 1;
            }),
        ]);

        expect(await isolatedStorage.get(["a", "b"] as const)).toEqual({a: 1, b: 2});
    });

    test("batch update aborts before reading or writing when a later lock fails", async () => {
        const abortError = new Error("The lock request was aborted.");
        abortError.name = "AbortError";

        const locker: StorageLocker = {
            async request(name, task) {
                if (name === "b") {
                    throw abortError;
                }

                return await task();
            },
        };

        const isolatedStorage = new Storage<BatchState>({locker});
        await isolatedStorage.set({a: 1, b: 2});

        const getSpy = chrome.storage.local.get as jest.Mock;
        const setSpy = chrome.storage.local.set as jest.Mock;
        const removeSpy = chrome.storage.local.remove as jest.Mock;
        getSpy.mockClear();
        setSpy.mockClear();
        removeSpy.mockClear();

        await expect(isolatedStorage.update(["a", "b"] as const, () => ({a: 2, b: 3}))).rejects.toMatchObject({
            name: "AbortError",
        });

        expect(getSpy).not.toHaveBeenCalled();
        expect(setSpy).not.toHaveBeenCalled();
        expect(removeSpy).not.toHaveBeenCalled();
    });

    test("empty batch operations do not call native storage", async () => {
        const isolatedStorage = new Storage<BatchState>();
        const updater = jest.fn(() => ({}));
        const compare = jest.fn(() => false);
        const getSpy = chrome.storage.local.get as jest.Mock;
        const setSpy = chrome.storage.local.set as jest.Mock;
        const removeSpy = chrome.storage.local.remove as jest.Mock;
        getSpy.mockClear();
        setSpy.mockClear();
        removeSpy.mockClear();

        await expect(isolatedStorage.get([])).resolves.toEqual({});
        await expect(isolatedStorage.set({})).resolves.toBeUndefined();
        await expect(isolatedStorage.update([], updater, {compare})).resolves.toEqual({});

        expect(updater).not.toHaveBeenCalled();
        expect(compare).not.toHaveBeenCalled();
        expect(getSpy).not.toHaveBeenCalled();
        expect(setSpy).not.toHaveBeenCalled();
        expect(removeSpy).not.toHaveBeenCalled();
    });
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
        const getSpy = chrome.storage.local.get as jest.Mock;
        const setSpy = chrome.storage.local.set as jest.Mock;
        const removeSpy = chrome.storage.local.remove as jest.Mock;
        const addListenerSpy = chrome.storage.onChanged.addListener as jest.Mock;
        getSpy.mockClear();
        setSpy.mockClear();
        removeSpy.mockClear();
        addListenerSpy.mockClear();

        await expect(isolatedStorage.get("bad:key")).rejects.toThrow(TypeError);
        await expect(isolatedStorage.set("bad:key", "value")).rejects.toThrow(TypeError);
        await expect(isolatedStorage.update("bad:key", updater)).rejects.toThrow(TypeError);
        await expect(isolatedStorage.remove("bad:key")).rejects.toThrow(TypeError);
        expect(() => isolatedStorage.watch({"bad:key": jest.fn()})).toThrow(TypeError);

        expect(updater).not.toHaveBeenCalled();
        expect(getSpy).not.toHaveBeenCalled();
        expect(setSpy).not.toHaveBeenCalled();
        expect(removeSpy).not.toHaveBeenCalled();
        expect(addListenerSpy).not.toHaveBeenCalled();
    });

    test("rejects an entire invalid batch before updater, locks, or native I/O", async () => {
        const isolatedStorage = new Storage<SeparatorState>();
        const updater = jest.fn(() => ({good: "updated"}));
        const getSpy = chrome.storage.local.get as jest.Mock;
        const setSpy = chrome.storage.local.set as jest.Mock;
        const removeSpy = chrome.storage.local.remove as jest.Mock;
        getSpy.mockClear();
        setSpy.mockClear();
        removeSpy.mockClear();

        await expect(isolatedStorage.get(["good", "bad:key"] as const)).rejects.toThrow(TypeError);
        await expect(isolatedStorage.set({good: "value", "bad:key": "invalid"})).rejects.toThrow(TypeError);
        await expect(isolatedStorage.update(["good", "bad:key"] as const, updater)).rejects.toThrow(TypeError);
        await expect(isolatedStorage.remove(["good", "bad:key"])).rejects.toThrow(TypeError);

        expect(updater).not.toHaveBeenCalled();
        expect(getSpy).not.toHaveBeenCalled();
        expect(setSpy).not.toHaveBeenCalled();
        expect(removeSpy).not.toHaveBeenCalled();
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

describe("set/get methods with different type of value", () => {
    test.each([
        ["string", "hello"],
        ["number", 42],
        ["boolean", true],
        ["null", null],
        ["object", {a: 1, b: true}],
        ["array", [1, 2, 3]],
    ])("set/get with %s", async (_, value) => {
        await storage.set("key", value);
        const result = await storage.get("key");
        expect(result).toEqual(value);
    });
});

describe("remove method", () => {
    test("deletes multiple keys in one native remove call", async () => {
        const isolatedStorage = new Storage<BatchState>({namespace: "batch"});
        await isolatedStorage.set({a: 1, b: 2, c: "keep"});

        const removeSpy = chrome.storage.local.remove as jest.Mock;
        removeSpy.mockClear();

        await isolatedStorage.remove(["a", "b"]);

        expect(removeSpy).toHaveBeenCalledTimes(1);
        expect(removeSpy).toHaveBeenCalledWith(["batch:a", "batch:b"], expect.any(Function));
        expect(await isolatedStorage.getAll()).toEqual({c: "keep"});
    });

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

describe("watch and subscribe methods", () => {
    test("subscribe receives one logical change map for one native multi-key event", async () => {
        const isolatedStorage = new Storage<BatchState>({namespace: "batch"});
        const batchCallback = jest.fn();
        const legacyCallback = jest.fn();
        const unsubscribeBatch = isolatedStorage.subscribe(batchCallback);
        const unsubscribeLegacy = isolatedStorage.watch(legacyCallback);

        global.simulateStorageChanges({
            storage: isolatedStorage,
            changes: {
                a: {oldValue: 1, newValue: 2},
                c: {oldValue: undefined, newValue: "created"},
            },
        });

        await flushMacrotask();

        expect(batchCallback).toHaveBeenCalledTimes(1);

        expect(batchCallback).toHaveBeenCalledWith({
            a: {oldValue: 1, newValue: 2},
            c: {oldValue: undefined, newValue: "created"},
        });

        expect(legacyCallback).toHaveBeenCalledTimes(2);
        expect(legacyCallback).toHaveBeenCalledWith(2, 1, "a");
        expect(legacyCallback).toHaveBeenCalledWith("created", undefined, "c");

        unsubscribeBatch();

        global.simulateStorageChanges({
            storage: isolatedStorage,
            changes: {a: {oldValue: 2, newValue: 3}},
        });

        await flushMacrotask();

        expect(batchCallback).toHaveBeenCalledTimes(1);
        unsubscribeLegacy();
    });

    test("subscribe ignores events from another namespace or storage area", async () => {
        const isolatedStorage = new Storage<BatchState>({namespace: "batch"});
        const otherNamespace = new Storage<BatchState>({namespace: "other"});
        const callback = jest.fn();
        const unsubscribe = isolatedStorage.subscribe(callback);

        global.simulateStorageChanges({
            storage: otherNamespace,
            changes: {a: {oldValue: 1, newValue: 2}},
        });

        global.simulateStorageChanges({
            storage: isolatedStorage,
            changes: {a: {oldValue: 1, newValue: 2}},
            areaName: "sync",
        });

        await flushMacrotask();

        expect(callback).not.toHaveBeenCalled();
        unsubscribe();
    });

    test("subscribe filters deep-equal entries and skips empty change maps", async () => {
        const isolatedStorage = new Storage<BatchState>();
        const callback = jest.fn();
        const unsubscribe = isolatedStorage.subscribe(callback);

        global.simulateStorageChanges({
            storage: isolatedStorage,
            changes: {
                a: {oldValue: 1, newValue: 1},
                b: {oldValue: 2, newValue: 3},
            },
        });

        await flushMacrotask();

        expect(callback).toHaveBeenCalledTimes(1);
        expect(callback).toHaveBeenCalledWith({b: {oldValue: 2, newValue: 3}});

        global.simulateStorageChanges({
            storage: isolatedStorage,
            changes: {a: {oldValue: 1, newValue: 1}},
        });

        await flushMacrotask();

        expect(callback).toHaveBeenCalledTimes(1);
        unsubscribe();
    });

    test("unsubscribe prevents delivery from an event already queued for formatting", async () => {
        const callback = jest.fn();
        const unsubscribe = storage.subscribe(callback);

        global.simulateStorageChange({
            storage,
            key: "theme",
            oldValue: "light",
            newValue: "dark",
        });

        unsubscribe();

        await flushMacrotask();

        expect(callback).not.toHaveBeenCalled();
    });

    test("an unresolved subscriber promise does not block later events", async () => {
        const pending = new Promise<void>(() => undefined);
        const callback = jest.fn().mockReturnValueOnce(pending).mockReturnValue(undefined);
        const unsubscribe = storage.subscribe(callback);

        global.simulateStorageChange({storage, key: "theme", oldValue: "light", newValue: "dark"});
        global.simulateStorageChange({storage, key: "volume", oldValue: 10, newValue: 20});

        await flushMacrotask();

        expect(callback).toHaveBeenCalledTimes(2);
        unsubscribe();
    });

    test("watch callback errors are uncaught without stopping sibling handlers or future events", async () => {
        const errors = captureUnhandledErrors();
        const failure = new Error("watch failed");

        const themeCallback = jest.fn(() => {
            throw failure;
        });

        const volumeCallback = jest.fn();
        const unsubscribe = storage.watch({theme: themeCallback, volume: volumeCallback});

        try {
            global.simulateStorageChanges({
                storage,
                changes: {
                    theme: {oldValue: "light", newValue: "dark"},
                    volume: {oldValue: 10, newValue: 20},
                },
            });

            await flushMacrotask();

            expect(themeCallback).toHaveBeenCalledTimes(1);
            expect(volumeCallback).toHaveBeenCalledTimes(1);
            expect(errors.pending).toBe(1);
            expect(() => errors.runNext()).toThrow(failure);

            global.simulateStorageChange({storage, key: "volume", oldValue: 20, newValue: 30});
            await flushMacrotask();

            expect(volumeCallback).toHaveBeenCalledTimes(2);
        } finally {
            unsubscribe();
            errors.restore();
        }
    });

    test("watch only resolves keyed callbacks from own properties", async () => {
        const prototypeCallback = jest.fn();
        const ownCallback = jest.fn();
        const handlers = Object.create({theme: prototypeCallback}) as Record<string, jest.Mock>;
        handlers.volume = ownCallback;
        const unsubscribe = storage.watch(handlers);

        global.simulateStorageChanges({
            storage,
            changes: {
                theme: {oldValue: "light", newValue: "dark"},
                volume: {oldValue: 10, newValue: 20},
            },
        });

        await flushMacrotask();

        expect(prototypeCallback).not.toHaveBeenCalled();
        expect(ownCallback).toHaveBeenCalledWith(20, 10);
        unsubscribe();
    });

    test("a throwing keyed watcher getter does not block sibling handlers or dispose the watch", async () => {
        const errors = captureUnhandledErrors();
        const failure = new Error("watch getter failed");
        const volumeCallback = jest.fn();
        const handlers: Record<string, jest.Mock> = {volume: volumeCallback};

        Object.defineProperty(handlers, "theme", {
            enumerable: true,
            get: () => {
                throw failure;
            },
        });

        const unsubscribe = storage.watch(handlers);

        try {
            global.simulateStorageChanges({
                storage,
                changes: {
                    theme: {oldValue: "light", newValue: "dark"},
                    volume: {oldValue: 10, newValue: 20},
                },
            });

            await flushMacrotask();

            expect(volumeCallback).toHaveBeenCalledTimes(1);
            expect(errors.pending).toBe(1);
            expect(() => errors.runNext()).toThrow(failure);

            global.simulateStorageChange({storage, key: "volume", oldValue: 20, newValue: 30});
            await flushMacrotask();
            expect(volumeCallback).toHaveBeenCalledTimes(2);
        } finally {
            unsubscribe();
            errors.restore();
        }
    });

    test("calls specific key callback on change", async () => {
        const keyCallback = jest.fn();
        storage.watch({theme: keyCallback});

        global.simulateStorageChange({
            storage,
            key: "theme",
            oldValue: "light",
            newValue: "dark",
        });

        await flushMacrotask();

        expect(keyCallback).toHaveBeenCalledWith("dark", "light");
    });

    test("does not call key callback for unrelated key", async () => {
        const keyCallback = jest.fn();
        storage.watch({theme: keyCallback});

        global.simulateStorageChange({
            storage,
            key: "volume",
            oldValue: 50,
            newValue: 80,
        });

        await flushMacrotask();

        expect(keyCallback).not.toHaveBeenCalled();
    });

    test("calls global callback on any change", async () => {
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

        await flushMacrotask();

        expect(globalCallback).toHaveBeenCalledWith(80, 50, "volume");
        expect(globalCallback).toHaveBeenCalledWith("dark", "light", "theme");
    });

    test("calls both key and global callbacks", async () => {
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

        await flushMacrotask();

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

            const s = Storage.Session<{s?: number}>();
            expect(s).toBeInstanceOf(Storage);
            await (s as Storage<any>).set("s" as any, 5 as any);

            const sessionAll = await getAllFromArea("session");
            expect(sessionAll["s"]).toBe(5);

            const localAll = await getAllFromArea("local");
            expect(localAll["s"]).toBeUndefined();
        });
    });
});
