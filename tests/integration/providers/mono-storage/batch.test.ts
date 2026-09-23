import {deferred, flushMacrotask} from "@tests/support/async";
import {browser} from "@tests/support/browser";
import MonoStorage from "~/providers/MonoStorage";
import Storage from "~/providers/Storage";

interface BucketState {
    a?: number;
    b?: {x: number} | number | string;
    c?: string;
}

const key = "bucket" as const;

let base: Storage<Record<typeof key, Partial<BucketState>>>;

beforeEach(() => {
    base = new Storage();
});

test("set rejects undefined and non-plain batch containers before touching the bucket", async () => {
    const mono = new MonoStorage<BucketState, typeof key>(key, base);
    const getSpy = browser.storage.local.get;
    const setSpy = browser.storage.local.set;
    getSpy.reset();
    setSpy.reset();

    await expect(mono.set({a: undefined})).rejects.toThrow(TypeError);
    await expect((mono.set as (value: unknown) => Promise<void>)("a")).rejects.toThrow(TypeError);

    expect(getSpy.calls).toHaveLength(0);
    expect(setSpy.calls).toHaveLength(0);
});

describe("batch overloads", () => {
    test("batch set writes one namespaced physical bucket and batch get reads it once", async () => {
        const underlying = new Storage<Record<typeof key, Partial<BucketState>>>({namespace: "feature"});
        const mono = new MonoStorage<BucketState, typeof key>(key, underlying);
        const setSpy = browser.storage.local.set;
        setSpy.reset();

        await mono.set({a: 1, b: 2, c: "ready"});

        expect(setSpy.calls).toHaveLength(1);

        expect(setSpy.calls).toContainEqual(expect.objectContaining({
            args: [{"feature:bucket": {a: 1, b: 2, c: "ready"}}],
            callback: expect.any(Function),
        }));

        const getSpy = browser.storage.local.get;
        getSpy.reset();

        await expect(mono.get(["a", "c"] as const)).resolves.toEqual({a: 1, c: "ready"});
        expect(getSpy.calls).toHaveLength(1);

        expect(getSpy.calls).toContainEqual(expect.objectContaining({
            args: ["feature:bucket"],
            callback: expect.any(Function),
        }));
    });

    test("batch update applies changed, equal, and deleted inner keys in one physical write", async () => {
        const underlying = new Storage<Record<typeof key, Partial<BucketState>>>();
        const mono = new MonoStorage<BucketState, typeof key>(key, underlying);
        await mono.set({a: 1, b: 2, c: "old"});

        const setSpy = browser.storage.local.set;
        const removeSpy = browser.storage.local.remove;
        setSpy.reset();
        removeSpy.reset();

        const result = await mono.update(["a", "b", "c"] as const, () => ({
            a: undefined,
            b: 2,
            c: "new",
        }));

        expect(result).toEqual({b: 2, c: "new"});
        expect(setSpy.calls).toHaveLength(1);

        expect(setSpy.calls).toContainEqual(expect.objectContaining({
            args: [{bucket: {b: 2, c: "new"}}],
            callback: expect.any(Function),
        }));

        expect(removeSpy.calls).toHaveLength(0);
        expect(await mono.getAll()).toEqual({b: 2, c: "new"});
    });

    test("batch update removes the physical bucket once when the final state is empty", async () => {
        const underlying = new Storage<Record<typeof key, Partial<BucketState>>>();
        const mono = new MonoStorage<BucketState, typeof key>(key, underlying);
        await mono.set({a: 1, c: "old"});

        const setSpy = browser.storage.local.set;
        const removeSpy = browser.storage.local.remove;
        setSpy.reset();
        removeSpy.reset();

        const result = await mono.update(["a", "c"] as const, () => ({a: undefined, c: undefined}));

        expect(result).toEqual({});
        expect(setSpy.calls).toHaveLength(0);
        expect(removeSpy.calls).toHaveLength(1);

        expect(removeSpy.calls).toContainEqual(expect.objectContaining({
            args: ["bucket"],
            callback: expect.any(Function),
        }));
    });

    test("aggregate comparer can force all explicit values into one physical bucket write", async () => {
        const underlying = new Storage<Record<typeof key, Partial<BucketState>>>();
        const mono = new MonoStorage<BucketState, typeof key>(key, underlying);
        await mono.set({a: 1, b: 2});

        const compare = jest.fn(() => false);
        const setSpy = browser.storage.local.set;
        setSpy.reset();

        const result = await mono.update(
            ["a", "b"] as const,
            () => ({a: 1, b: 3}),
            {compare}
        );

        expect(compare).toHaveBeenCalledTimes(1);
        expect(compare).toHaveBeenCalledWith({a: 1, b: 2}, {a: 1, b: 3});
        expect(result).toEqual({a: 1, b: 3});
        expect(setSpy.calls).toHaveLength(1);

        expect(setSpy.calls).toContainEqual(expect.objectContaining({
            args: [{bucket: {a: 1, b: 3}}],
            callback: expect.any(Function),
        }));
    });

    test("aggregate comparer can skip the whole logical patch without writing the bucket", async () => {
        const underlying = new Storage<Record<typeof key, Partial<BucketState>>>();
        const mono = new MonoStorage<BucketState, typeof key>(key, underlying);
        await mono.set({a: 1, b: 2});

        const compare = jest.fn(() => true);
        const setSpy = browser.storage.local.set;
        setSpy.reset();

        const result = await mono.update(
            ["a", "b"] as const,
            () => ({a: undefined, b: 3}),
            {compare}
        );

        expect(compare).toHaveBeenCalledWith({a: 1, b: 2}, {b: 3});
        expect(result).toEqual({a: 1, b: 2});
        expect(setSpy.calls).toHaveLength(0);
    });

    test("batch update rejects unrequested keys without changing the bucket", async () => {
        const underlying = new Storage<Record<typeof key, Partial<BucketState>>>();
        const mono = new MonoStorage<BucketState, typeof key>(key, underlying);
        await mono.set({a: 1});

        const setSpy = browser.storage.local.set;
        const removeSpy = browser.storage.local.remove;
        setSpy.reset();
        removeSpy.reset();

        await expect(
            mono.update(["a"] as const, () => ({b: 2}) as unknown as Partial<Pick<BucketState, "a">>)
        ).rejects.toThrow("unrequested key");

        expect(setSpy.calls).toHaveLength(0);
        expect(removeSpy.calls).toHaveLength(0);
        expect(await mono.getAll()).toEqual({a: 1});
    });

    test("empty batch operations do not read, lock, or write the physical bucket", async () => {
        const underlying = new Storage<Record<typeof key, Partial<BucketState>>>();
        const mono = new MonoStorage<BucketState, typeof key>(key, underlying);
        const updater = jest.fn(() => ({}));
        const compare = jest.fn(() => false);
        const getSpy = browser.storage.local.get;
        const setSpy = browser.storage.local.set;
        const removeSpy = browser.storage.local.remove;
        getSpy.reset();
        setSpy.reset();
        removeSpy.reset();

        await expect(mono.get([])).resolves.toEqual({});
        await expect(mono.set({})).resolves.toBeUndefined();
        await expect(mono.update([], updater, {compare})).resolves.toEqual({});
        await expect(mono.remove([])).resolves.toBeUndefined();

        expect(updater).not.toHaveBeenCalled();
        expect(compare).not.toHaveBeenCalled();
        expect(getSpy.calls).toHaveLength(0);
        expect(setSpy.calls).toHaveLength(0);
        expect(removeSpy.calls).toHaveLength(0);
    });

    test("batch update serializes concurrent bucket batches", async () => {
        const underlying = new Storage<Record<typeof key, Partial<BucketState>>>();
        const mono = new MonoStorage<BucketState, typeof key>(key, underlying);
        await mono.set({a: 0, b: 0});

        const started = deferred();
        const release = deferred();
        const secondStarted = jest.fn();

        const first = mono.update(["a", "b"] as const, async prev => {
            started.resolve();
            await release.promise;

            return {a: (prev.a ?? 0) + 1, b: Number(prev.b ?? 0) + 1};
        });

        await started.promise;

        const second = mono.update(["b", "a"] as const, async prev => {
            secondStarted();

            return {a: (prev.a ?? 0) + 1, b: Number(prev.b ?? 0) + 1};
        });

        await flushMacrotask();
        expect(secondStarted).not.toHaveBeenCalled();
        release.resolve();
        await Promise.all([first, second]);

        expect(await mono.get(["a", "b"] as const)).toEqual({a: 2, b: 2});
    });

    test("removing a missing logical key does not create an empty bucket", async () => {
        const mono = new MonoStorage<BucketState, typeof key>(key, base);
        const setSpy = browser.storage.local.set;
        const removeSpy = browser.storage.local.remove;
        setSpy.reset();
        removeSpy.reset();

        await mono.remove("a");

        expect(setSpy.calls).toHaveLength(0);
        expect(removeSpy.calls).toHaveLength(0);
        expect(browser.storage.local.data[key]).toBeUndefined();
    });

    test("single update comparer can force a deeply-equal physical write", async () => {
        const mono = new MonoStorage<BucketState, typeof key>(key, base);
        await mono.set("b", {x: 1});
        const setSpy = browser.storage.local.set;
        setSpy.reset();

        await mono.update("b", previous => ({...(previous as {x: number})}), {compare: () => false});

        expect(setSpy.calls).toHaveLength(1);
    });

    test("single update comparer returns the stored value when it skips a write", async () => {
        const mono = new MonoStorage<BucketState, typeof key>(key, base);
        await mono.set("a", 1);
        const setSpy = browser.storage.local.set;
        setSpy.reset();

        const result = await mono.update("a", () => 2, {compare: () => true});

        expect(result).toBe(1);
        expect(setSpy.calls).toHaveLength(0);
        await expect(mono.get("a")).resolves.toBe(1);
    });
});
