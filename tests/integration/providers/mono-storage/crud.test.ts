import {browser} from "@tests/support/browser";
import MonoStorage from "~/providers/MonoStorage";
import SecureStorage from "~/providers/SecureStorage";
import Storage from "~/providers/Storage";

interface BucketState {
    a?: number;
    b?: {x: number} | number | string;
    c?: string;
}

const key = "bucket" as const;

let base: Storage<Record<typeof key, Partial<BucketState>>>;

let secureBase: SecureStorage<Record<typeof key, Partial<BucketState>>>;

beforeEach(() => {
    base = new Storage();
    secureBase = new SecureStorage();
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
    const raw = browser.storage.local.data[key];
    expect(raw).toEqual({a: 1, c: "hello"});
});

test("set performs a physical bucket write even when the value is deeply equal", async () => {
    const mono = new MonoStorage<BucketState, typeof key>(key, base);
    await mono.set("b", {x: 1});

    const setSpy = browser.storage.local.set;
    setSpy.reset();

    await mono.set("b", {x: 1});

    expect(setSpy.calls).toHaveLength(1);

    expect(setSpy.calls).toContainEqual(expect.objectContaining({
        args: [{bucket: {b: {x: 1}}}],
        callback: expect.any(Function),
    }));
});

test("getAll returns the whole bucket", async () => {
    const mono = new MonoStorage<BucketState, typeof key>(key, base);
    await mono.set("a", 1);
    await mono.set("b", {x: 2});

    expect(await mono.getAll()).toEqual({a: 1, b: {x: 2}});
});

test("remove single and multiple keys; remove physical when bucket empty", async () => {
    const mono = new MonoStorage<BucketState, typeof key>(key, base);
    await mono.set("a", 1);
    await mono.set("b", 2);
    await mono.set("c", "z");

    await mono.remove("b");
    expect(await mono.getAll()).toEqual({a: 1, c: "z"});

    await mono.remove(["a", "c"]);
    const raw = browser.storage.local.data[key];
    expect(raw).toBeUndefined();
});

test("clear removes the physical key", async () => {
    const mono = new MonoStorage<BucketState, typeof key>(key, base);
    await mono.set("a", 1);
    await mono.set("b", 2);

    await mono.clear();
    const raw = browser.storage.local.data[key];
    expect(raw).toBeUndefined();
    expect(await mono.getAll()).toEqual({});
});

test("works with SecureStorage as underlying provider", async () => {
    const mono = new MonoStorage<BucketState, typeof key>(key, secureBase as any);

    await mono.set("a", 1);
    await mono.set("c", "sec");

    expect(await mono.get("a")).toBe(1);
    expect(await mono.get("c")).toBe("sec");

    const raw = browser.storage.local.data["secure:" + ":" + key];
    expect(typeof raw).toBe("string");
    const allRaw = await chrome.storage.local.get(null);
    expect(typeof allRaw["secure::bucket"]).toBe("string");
    expect(allRaw["secure:bucket"]).toBeUndefined();

    const decryptedAll = await secureBase.getAll();
    expect(decryptedAll[key]).toEqual({a: 1, c: "sec"});
});
