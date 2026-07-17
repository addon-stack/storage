import MonoStorage from "../providers/MonoStorage";
import SecureStorage from "../providers/SecureStorage";
import Storage from "../providers/Storage";
import type {StorageHelper} from "../types";
import {
    storage,
    storageLocal,
    storageManaged,
    storageSecure,
    storageSession,
    storageSync,
} from "./storage";

const areas = ["local", "session", "sync", "managed"] as const;

const clearAreas = async (): Promise<void> => {
    await Promise.all(
        areas.map(
            area =>
                new Promise<void>(resolve => {
                    chrome.storage[area].clear(resolve);
                })
        )
    );
};

const getAreaValues = async (area: (typeof areas)[number]): Promise<Record<string, unknown>> =>
    await new Promise(resolve => chrome.storage[area].get(null, resolve));

beforeEach(async () => {
    await clearAreas();
    jest.clearAllMocks();
});

test("returns real providers for plain, secure, options, and Mono calls", () => {
    expect(storage()).toBeInstanceOf(Storage);
    expect(storageLocal()).toBeInstanceOf(Storage);
    expect(storageLocal(undefined)).toBeInstanceOf(Storage);
    expect(storageLocal({namespace: "settings"})).toBeInstanceOf(Storage);
    expect(storageLocal({key: "popup"})).toBeInstanceOf(MonoStorage);
    expect(storageSecure()).toBeInstanceOf(SecureStorage);
    expect(storageSecure({secureKey: "AppSecret"})).toBeInstanceOf(SecureStorage);
    expect(storageSecure({key: "auth", secureKey: "AppSecret"})).toBeInstanceOf(MonoStorage);
});

test("creates a new provider for every provider-form call", () => {
    expect(storageLocal()).not.toBe(storageLocal());
});

test("supports one-shot single set, single get, and batch get", async () => {
    await storageLocal<string>("theme", "dark");
    await storageLocal<number>("attempts", 3);

    await expect(storageLocal<string>("theme")).resolves.toBe("dark");
    await expect(storageLocal<number>("missing")).resolves.toBeUndefined();
    await expect(storageLocal(["theme", "attempts", "missing"] as const)).resolves.toEqual({
        attempts: 3,
        theme: "dark",
    });
});

test.each([
    ["local", storageLocal],
    ["session", storageSession],
    ["sync", storageSync],
    ["managed", storageManaged],
] as const)("storage%s uses its matching native area", async (area, helper) => {
    await (helper as StorageHelper<object>)("selectedArea", area);

    await expect(getAreaValues(area)).resolves.toMatchObject({selectedArea: area});

    for (const otherArea of areas.filter(value => value !== area)) {
        await expect(getAreaValues(otherArea)).resolves.not.toHaveProperty("selectedArea");
    }
});

test("storage accepts area while area-specific helpers reject it", async () => {
    const sync = storage<{theme?: string}>({area: "sync", namespace: "settings"});

    await sync.set("theme", "dark");

    await expect(getAreaValues("sync")).resolves.toMatchObject({"settings:theme": "dark"});
    expect(() => (storageLocal as any)({area: "sync"})).toThrow(
        'storageLocal options contain an unsupported property "area".'
    );
});

test("forwards namespace, key, and locker options to existing factories", async () => {
    const requests: string[] = [];
    const locker = {
        async request<T>(name: string, task: () => Promise<T>): Promise<T> {
            requests.push(name);
            return await task();
        },
    };
    const namespaced = storageLocal<{count?: number}>({locker, namespace: "feature"});
    const mono = storageLocal<{theme?: string}>({key: "settings"});

    await namespaced.update("count", value => (value ?? 0) + 1);
    await mono.set("theme", "dark");

    expect(requests).toEqual(["feature:count"]);
    await expect(getAreaValues("local")).resolves.toMatchObject({
        "feature:count": 1,
        settings: {theme: "dark"},
    });
});

test("accepts null-prototype options", () => {
    const options = Object.create(null) as {namespace?: string};
    options.namespace = "prototype-free";

    expect(storageLocal(options)).toBeInstanceOf(Storage);
});

test.each([null, new Date(), () => undefined, 42])("rejects invalid single arguments: %p", argument => {
    expect(() => (storageLocal as any)(argument)).toThrow(
        "storageLocal expects options, a string key, or an array of string keys."
    );
});

test("rejects unknown options instead of treating an object as batch set", () => {
    expect(() => (storageLocal as any)({theme: "dark"})).toThrow(
        'storageLocal options contain an unsupported property "theme".'
    );
    expect(chrome.storage.local.set).not.toHaveBeenCalled();
});

test("rejects invalid batch keys, set keys, and arity", () => {
    expect(() => (storageLocal as any)(["theme", 1])).toThrow("storageLocal batch get keys must be strings.");
    expect(() => (storageLocal as any)(["theme"], "dark")).toThrow(
        "storageLocal set key must be a string."
    );
    expect(() => (storageLocal as any)("theme", "dark", true)).toThrow(
        "storageLocal expects zero, one, or two arguments."
    );
});

test("routes explicit undefined through set validation without native I/O", async () => {
    await expect((storageLocal as any)("theme", undefined)).rejects.toThrow(
        "Storage set value must not be undefined."
    );
    expect(chrome.storage.local.set).not.toHaveBeenCalled();
});

test("supports typed one-shot set and get with the default secure provider", async () => {
    await storageSecure<string>("token", "secret");

    await expect(storageSecure<string>("token")).resolves.toBe("secret");

    const values = await getAreaValues("local");
    expect(typeof values["secure::token"]).toBe("string");
    expect(values["secure::token"]).not.toBe("secret");
});

test("forwards area, namespace, and secureKey", async () => {
    const digestSpy = crypto.subtle.digest as jest.Mock;
    const auth = storageSecure<{token?: string}>({
        area: "session",
        namespace: "auth",
        secureKey: "ForwardedSecret",
    });

    await auth.set("token", "secret");

    expect(digestSpy).toHaveBeenCalledWith("SHA-256", new TextEncoder().encode("ForwardedSecret"));
    await expect(getAreaValues("session")).resolves.toHaveProperty("secure:auth:token");
    await expect(getAreaValues("local")).resolves.not.toHaveProperty("secure:auth:token");
});

test("creates MonoStorage over SecureStorage through the key option", async () => {
    const auth = storageSecure<{token?: string}>({
        area: "sync",
        key: "auth",
        secureKey: "AppSecret",
    });

    await auth.set("token", "secret");

    await expect(auth.get("token")).resolves.toBe("secret");
    const values = await getAreaValues("sync");
    expect(typeof values["secure::auth"]).toBe("string");
});

test("rejects unknown secure options before encryption or native I/O", () => {
    expect(() => (storageSecure as any)({token: "secret"})).toThrow(
        'storageSecure options contain an unsupported property "token".'
    );
    expect(crypto.subtle.encrypt).not.toHaveBeenCalled();
    expect(chrome.storage.local.set).not.toHaveBeenCalled();
});
