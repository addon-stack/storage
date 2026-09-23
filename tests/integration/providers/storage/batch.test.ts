import {deferred, flushMacrotask} from "@tests/support/async";
import {browser} from "@tests/support/browser";
import {StoragePartialUpdateError} from "~/errors";
import Storage from "~/providers/Storage";

import type {StorageLocker} from "~/types";

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

describe("batch overloads", () => {
    test("batch get reads requested namespaced keys in one native call and omits missing values", async () => {
        const isolatedStorage = new Storage<BatchState>({namespace: "batch"});

        await chrome.storage.local.set({
            "batch:a": 1,
            "batch:b": 2,
            "other:a": 99,
        });

        const getSpy = browser.storage.local.get;
        getSpy.reset();

        const result = await isolatedStorage.get(["a", "b", "missing"] as const);

        expect(result).toEqual({a: 1, b: 2});
        expect(getSpy.calls).toHaveLength(1);

        expect(getSpy.calls).toContainEqual(expect.objectContaining({
            args: [["batch:a", "batch:b", "batch:missing"]],
            callback: expect.any(Function),
        }));
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

        browser.storage.onChanged.emit({["__proto__"]: {oldValue: "stored", newValue: "stored:updated"}}, "local");

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
        const setSpy = browser.storage.local.set;
        setSpy.reset();

        await isolatedStorage.set({a: 1, b: 2, c: "ready"});

        expect(setSpy.calls).toHaveLength(1);

        expect(setSpy.calls).toContainEqual(expect.objectContaining({
            args: [{"batch:a": 1, "batch:b": 2, "batch:c": "ready"}],
            callback: expect.any(Function),
        }));

        expect(await (async () => await chrome.storage.local.get(["batch:a", "batch:b", "batch:c"]))()).toEqual({
            "batch:a": 1,
            "batch:b": 2,
            "batch:c": "ready",
        });
    });

    test("set overload rejects a two-argument undefined value before a native write", async () => {
        const isolatedStorage = new Storage<BatchState>({namespace: "batch"});
        const setSpy = browser.storage.local.set;
        setSpy.reset();

        await expect(isolatedStorage.set("a", undefined as never)).rejects.toThrow(TypeError);

        expect(setSpy.calls).toHaveLength(0);
    });

    test("batch set rejects undefined values before a native write", async () => {
        const isolatedStorage = new Storage<BatchState>({namespace: "batch"});
        const setSpy = browser.storage.local.set;
        setSpy.reset();

        await expect(isolatedStorage.set({a: undefined})).rejects.toThrow(TypeError);

        expect(setSpy.calls).toHaveLength(0);
    });

    test.each(["theme", null, [], new Date(), new Map(), () => undefined, new (class Value {})()])(
        "batch set rejects a non-plain object container %#",
        async values => {
            const isolatedStorage = new Storage<BatchState>();
            const setSpy = browser.storage.local.set;
            setSpy.reset();

            await expect((isolatedStorage.set as (value: unknown) => Promise<void>)(values)).rejects.toThrow(
                TypeError
            );

            expect(setSpy.calls).toHaveLength(0);
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

        const getSpy = browser.storage.local.get;
        const setSpy = browser.storage.local.set;
        const removeSpy = browser.storage.local.remove;
        getSpy.reset();
        setSpy.reset();
        removeSpy.reset();

        const updater = jest.fn((prev: Partial<Pick<BatchState, "a" | "b" | "c">>) => ({
            a: (prev.a ?? 0) + 1,
            b: 2,
            c: "created",
        }));

        const result = await isolatedStorage.update(["a", "b", "c"] as const, updater);

        expect(updater).toHaveBeenCalledTimes(1);
        expect(updater).toHaveBeenCalledWith({a: 1, b: 2});
        expect(result).toEqual({a: 2, b: 2, c: "created"});
        expect(getSpy.calls).toHaveLength(1);

        expect(getSpy.calls).toContainEqual(expect.objectContaining({
            args: [["batch:a", "batch:b", "batch:c"]],
            callback: expect.any(Function),
        }));

        expect(setSpy.calls).toHaveLength(1);

        expect(setSpy.calls).toContainEqual(expect.objectContaining({
            args: [{"batch:a": 2, "batch:c": "created"}],
            callback: expect.any(Function),
        }));

        expect(removeSpy.calls).toHaveLength(0);
    });

    test("batch update applies mixed writes before removals and returns the final snapshot", async () => {
        const isolatedStorage = new Storage<BatchState>({namespace: "batch"});
        await isolatedStorage.set({a: 1, b: 2});

        const setSpy = browser.storage.local.set;
        const removeSpy = browser.storage.local.remove;
        setSpy.reset();
        removeSpy.reset();

        const result = await isolatedStorage.update(["a", "b"] as const, () => ({a: undefined, b: 3}));

        expect(result).toEqual({b: 3});
        expect(setSpy.calls).toHaveLength(1);

        expect(setSpy.calls).toContainEqual(expect.objectContaining({
            args: [{"batch:b": 3}],
            callback: expect.any(Function),
        }));

        expect(removeSpy.calls).toHaveLength(1);

        expect(removeSpy.calls).toContainEqual(expect.objectContaining({
            args: [["batch:a"]],
            callback: expect.any(Function),
        }));

        expect(setSpy.calls[0]!.sequence).toBeLessThan(removeSpy.calls[0]!.sequence);
    });

    test("batch update reports a partial commit when remove fails after set", async () => {
        const isolatedStorage = new Storage<BatchState>();
        await isolatedStorage.set({a: 1, b: 2});
        browser.storage.local.remove.failNext(new Error("remove failed"));

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

        const setSpy = browser.storage.local.set;
        const removeSpy = browser.storage.local.remove;
        setSpy.reset();
        removeSpy.reset();

        await expect(
            isolatedStorage.update(
                ["a"] as const,
                () => ({b: 2}) as unknown as Partial<Pick<BatchState, "a">>
            )
        ).rejects.toThrow();

        expect(setSpy.calls).toHaveLength(0);
        expect(removeSpy.calls).toHaveLength(0);
        expect(await isolatedStorage.get(["a", "b"] as const)).toEqual({a: 1});
    });

    test.each([new Date(), new Map(), new (class Patch {})()])(
        "batch update rejects a non-plain patch %# without writing",
        async patch => {
            const isolatedStorage = new Storage<BatchState>();
            const setSpy = browser.storage.local.set;
            const removeSpy = browser.storage.local.remove;
            setSpy.reset();
            removeSpy.reset();

            await expect(
                isolatedStorage.update(["a"] as const, () => patch as Partial<Pick<BatchState, "a">>)
            ).rejects.toThrow(TypeError);

            expect(setSpy.calls).toHaveLength(0);
            expect(removeSpy.calls).toHaveLength(0);
        }
    );

    test("batch update does not write when the updater throws", async () => {
        const isolatedStorage = new Storage<BatchState>();
        await isolatedStorage.set({a: 1, b: 2});

        const setSpy = browser.storage.local.set;
        const removeSpy = browser.storage.local.remove;
        setSpy.reset();
        removeSpy.reset();

        await expect(
            isolatedStorage.update(["a", "b"] as const, async () => {
                throw new Error("batch failed");
            })
        ).rejects.toThrow("batch failed");

        expect(setSpy.calls).toHaveLength(0);
        expect(removeSpy.calls).toHaveLength(0);
        expect(await isolatedStorage.get(["a", "b"] as const)).toEqual({a: 1, b: 2});
    });

    test("batch update skips native writes for an empty or equal patch", async () => {
        const isolatedStorage = new Storage<BatchState>();
        await isolatedStorage.set({a: 1, b: 2});

        const setSpy = browser.storage.local.set;
        const removeSpy = browser.storage.local.remove;
        setSpy.reset();
        removeSpy.reset();

        await expect(isolatedStorage.update(["a", "b"] as const, () => ({}))).resolves.toEqual({a: 1, b: 2});

        await expect(isolatedStorage.update(["a", "b"] as const, () => ({a: 1, b: 2}))).resolves.toEqual({
            a: 1,
            b: 2,
        });

        expect(setSpy.calls).toHaveLength(0);
        expect(removeSpy.calls).toHaveLength(0);
    });

    test("aggregate comparer can skip the whole mixed patch and returns the stored snapshot", async () => {
        const isolatedStorage = new Storage<BatchState>();
        await isolatedStorage.set({a: 1, b: 2});

        const compare = jest.fn(() => true);
        const setSpy = browser.storage.local.set;
        const removeSpy = browser.storage.local.remove;
        setSpy.reset();
        removeSpy.reset();

        const result = await isolatedStorage.update(
            ["a", "b"] as const,
            () => ({a: undefined, b: 3}),
            {compare}
        );

        expect(compare).toHaveBeenCalledTimes(1);
        expect(compare).toHaveBeenCalledWith({a: 1, b: 2}, {b: 3});
        expect(result).toEqual({a: 1, b: 2});
        expect(setSpy.calls).toHaveLength(0);
        expect(removeSpy.calls).toHaveLength(0);
    });

    test("aggregate comparer can force every explicit value to be written", async () => {
        const isolatedStorage = new Storage<BatchState>();
        await isolatedStorage.set({a: 1, b: 2});

        const compare = jest.fn(() => false);
        const setSpy = browser.storage.local.set;
        setSpy.reset();

        const result = await isolatedStorage.update(
            ["a", "b"] as const,
            () => ({a: 1, b: 3}),
            {compare}
        );

        expect(compare).toHaveBeenCalledTimes(1);
        expect(compare).toHaveBeenCalledWith({a: 1, b: 2}, {a: 1, b: 3});
        expect(result).toEqual({a: 1, b: 3});
        expect(setSpy.calls).toHaveLength(1);

        expect(setSpy.calls).toContainEqual(expect.objectContaining({
            args: [{a: 1, b: 3}],
            callback: expect.any(Function),
        }));
    });

    test("aggregate comparer errors before any native write", async () => {
        const isolatedStorage = new Storage<BatchState>();
        await isolatedStorage.set({a: 1, b: 2});

        const setSpy = browser.storage.local.set;
        const removeSpy = browser.storage.local.remove;
        setSpy.reset();
        removeSpy.reset();

        await expect(
            isolatedStorage.update(["a", "b"] as const, () => ({a: undefined, b: 3}), {
                compare: () => {
                    throw new Error("compare failed");
                },
            })
        ).rejects.toThrow("compare failed");

        expect(setSpy.calls).toHaveLength(0);
        expect(removeSpy.calls).toHaveLength(0);
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

        const started = deferred();
        const release = deferred();
        const secondStarted = jest.fn();

        const first = isolatedStorage.update(["a", "b"] as const, async prev => {
            started.resolve();
            await release.promise;

            return {a: (prev.a ?? 0) + 1, b: (prev.b ?? 0) + 1};
        });

        await started.promise;

        const second = isolatedStorage.update(["b", "a"] as const, async prev => {
            secondStarted();

            return {a: (prev.a ?? 0) + 1, b: (prev.b ?? 0) + 1};
        });

        await flushMacrotask();
        expect(secondStarted).not.toHaveBeenCalled();
        release.resolve();
        await Promise.all([first, second]);

        expect(await isolatedStorage.get(["a", "b"] as const)).toEqual({a: 2, b: 2});
    });

    test("batch update coordinates with a single-key update on an overlapping key", async () => {
        const isolatedStorage = new Storage<BatchState>();
        await isolatedStorage.set({a: 0, b: 0});

        const started = deferred();
        const release = deferred();
        const secondStarted = jest.fn();

        const first = isolatedStorage.update(["a", "b"] as const, async prev => {
            started.resolve();
            await release.promise;

            return {a: (prev.a ?? 0) + 1, b: (prev.b ?? 0) + 1};
        });

        await started.promise;

        const second = isolatedStorage.update("b", async prev => {
            secondStarted();

            return (prev ?? 0) + 1;
        });

        await flushMacrotask();
        expect(secondStarted).not.toHaveBeenCalled();
        release.resolve();
        await Promise.all([first, second]);

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

        const getSpy = browser.storage.local.get;
        const setSpy = browser.storage.local.set;
        const removeSpy = browser.storage.local.remove;
        getSpy.reset();
        setSpy.reset();
        removeSpy.reset();

        await expect(isolatedStorage.update(["a", "b"] as const, () => ({a: 2, b: 3}))).rejects.toMatchObject({
            name: "AbortError",
        });

        expect(getSpy.calls).toHaveLength(0);
        expect(setSpy.calls).toHaveLength(0);
        expect(removeSpy.calls).toHaveLength(0);
    });

    test("empty batch operations do not call native storage", async () => {
        const isolatedStorage = new Storage<BatchState>();
        const updater = jest.fn(() => ({}));
        const compare = jest.fn(() => false);
        const getSpy = browser.storage.local.get;
        const setSpy = browser.storage.local.set;
        const removeSpy = browser.storage.local.remove;
        getSpy.reset();
        setSpy.reset();
        removeSpy.reset();

        await expect(isolatedStorage.get([])).resolves.toEqual({});
        await expect(isolatedStorage.set({})).resolves.toBeUndefined();
        await expect(isolatedStorage.update([], updater, {compare})).resolves.toEqual({});

        expect(updater).not.toHaveBeenCalled();
        expect(compare).not.toHaveBeenCalled();
        expect(getSpy.calls).toHaveLength(0);
        expect(setSpy.calls).toHaveLength(0);
        expect(removeSpy.calls).toHaveLength(0);
    });
});
