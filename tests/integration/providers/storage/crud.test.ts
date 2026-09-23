import {browser} from "@tests/support/browser";
import Storage from "~/providers/Storage";

const namespace = "user";

let storage: Storage;

let storageWithNamespace: Storage;

interface BatchState {
    a?: number;
    b?: number;
    c?: string;
    missing?: boolean;
}

beforeEach(() => {
    storage = new Storage();
    storageWithNamespace = new Storage({namespace});
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

    expect(browser.storage.local.data["displayName"]).toBe("Ada Lovelace");
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

        const removeSpy = browser.storage.local.remove;
        removeSpy.reset();

        await isolatedStorage.remove(["a", "b"]);

        expect(removeSpy.calls).toHaveLength(1);

        expect(removeSpy.calls).toContainEqual(expect.objectContaining({
            args: [["batch:a", "batch:b"]],
            callback: expect.any(Function),
        }));

        expect(await isolatedStorage.getAll()).toEqual({c: "keep"});
    });

    test("deletes the key without namespace", async () => {
        await storage.set("theme", "dark");
        await storage.remove("theme");
        const result = browser.storage.local.data["theme"];
        expect(result).toBeUndefined();
    });

    test("deletes the key with namespace", async () => {
        await storageWithNamespace.set("theme", "dark");
        await storageWithNamespace.remove("theme");
        const result = browser.storage.local.data[`${namespace}:theme`];
        expect(result).toBeUndefined();
    });
});
