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

test("update skips physical bucket write when inner value is equal", async () => {
    const mono = new MonoStorage<BucketState, typeof key>(key, base);
    await mono.set("b", {x: 1});

    const setSpy = browser.storage.local.set;
    setSpy.reset();

    await mono.update("b", prev => (prev && typeof prev === "object" ? {...prev} : {x: 1}));

    expect(setSpy.calls).toHaveLength(0);
    expect(await mono.getAll()).toEqual({b: {x: 1}});
});

test("update skips physical bucket write when deleting an absent inner key", async () => {
    const mono = new MonoStorage<BucketState, typeof key>(key, base);
    await mono.set("a", 1);

    const setSpy = browser.storage.local.set;
    const removeSpy = browser.storage.local.remove;
    setSpy.reset();
    removeSpy.reset();

    await mono.update("c", () => undefined);

    expect(setSpy.calls).toHaveLength(0);
    expect(removeSpy.calls).toHaveLength(0);
    expect(await mono.getAll()).toEqual({a: 1});
});

test("update writes the physical bucket when inner value changes", async () => {
    const mono = new MonoStorage<BucketState, typeof key>(key, base);
    await mono.set("a", 1);

    const setSpy = browser.storage.local.set;
    setSpy.reset();

    await mono.update("a", prev => (prev ?? 0) + 1);

    expect(setSpy.calls).toHaveLength(1);
    expect(await mono.getAll()).toEqual({a: 2});
});

test("update(undefined) deletes key and removes physical entry when empty", async () => {
    const mono = new MonoStorage<BucketState, typeof key>(key, base);
    await mono.set("a", 1);
    await mono.set("b", 2);

    await mono.update("a", () => undefined);
    expect(await mono.get("a")).toBeUndefined();
    let raw = browser.storage.local.data[key];
    expect(raw).toEqual({b: 2});

    await mono.update("b", () => undefined);
    // physical key should be removed entirely
    raw = browser.storage.local.data[key];
    expect(raw).toBeUndefined();
});
