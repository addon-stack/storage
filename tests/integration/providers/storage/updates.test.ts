import {browser} from "@tests/support/browser";
import Storage from "~/providers/Storage";

let storage: Storage;

beforeEach(() => {
    storage = new Storage();
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

describe("update method - no-op writes", () => {
    test.each([
        ["primitive", "dark", () => "dark"],
        ["object", {theme: "dark"}, (prev: {theme: string} | undefined) => ({...prev})],
    ])("skips storage.set when the next %s value is equal", async (_, initialValue, updater) => {
        await storage.set("settings", initialValue);

        const setSpy = browser.storage.local.set;
        setSpy.reset();

        await storage.update("settings", updater as any);

        expect(setSpy.calls).toHaveLength(0);
        expect(await storage.get("settings")).toEqual(initialValue);
    });

    test("writes when the next value changes", async () => {
        await storage.set("settings", {theme: "light"});

        const setSpy = browser.storage.local.set;
        setSpy.reset();

        await storage.update("settings", prev => ({...prev, theme: "dark"}));

        expect(setSpy.calls).toHaveLength(1);
        expect(await storage.get("settings")).toEqual({theme: "dark"});
    });

    test("writes when creating a missing value", async () => {
        const setSpy = browser.storage.local.set;
        setSpy.reset();

        await storage.update("settings", () => ({theme: "dark"}));

        expect(setSpy.calls).toHaveLength(1);
        expect(await storage.get("settings")).toEqual({theme: "dark"});
    });

    test("skips storage.remove when deleting an already missing value", async () => {
        const removeSpy = browser.storage.local.remove;
        removeSpy.reset();

        await storage.update("missing", () => undefined);

        expect(removeSpy.calls).toHaveLength(0);
    });

    test("custom compare can force a write for equal values", async () => {
        const initialValue = {theme: "dark"};
        const nextValue = {theme: "dark"};
        const compare = jest.fn(() => false);

        await storage.set("settings", initialValue);

        const setSpy = browser.storage.local.set;
        setSpy.reset();

        await storage.update("settings", () => nextValue, {
            compare,
        });

        expect(compare).toHaveBeenCalledWith(initialValue, nextValue);
        expect(setSpy.calls).toHaveLength(1);
        expect(await storage.get("settings")).toEqual({theme: "dark"});
    });

    test("custom compare can force a skip for unequal values", async () => {
        await storage.set("settings", {theme: "light"});

        const setSpy = browser.storage.local.set;
        setSpy.reset();

        const result = await storage.update("settings", () => ({theme: "dark"}), {
            compare: () => true,
        });

        expect(result).toEqual({theme: "light"});
        expect(setSpy.calls).toHaveLength(0);
        expect(await storage.get("settings")).toEqual({theme: "light"});
    });
});
