import {deferred, flushMacrotask} from "@tests/support/async";
import {browser} from "@tests/support/browser";
import Storage from "~/providers/Storage";

import type {StorageLocker} from "~/types";

let storage: Storage;

beforeEach(() => {
    storage = new Storage();
});

test("update method - serializes concurrent writes for the same key", async () => {
    await storage.set("count", 0);

    const started = deferred();
    const release = deferred();
    const secondStarted = jest.fn();

    const first = storage.update("count", async prev => {
        started.resolve();
        await release.promise;

        return (prev ?? 0) + 1;
    });

    await started.promise;

    const second = storage.update("count", async prev => {
        secondStarted();

        return (prev ?? 0) + 1;
    });

    await flushMacrotask();
    expect(secondStarted).not.toHaveBeenCalled();
    release.resolve();
    await Promise.all([first, second]);

    expect(await storage.get("count")).toBe(2);
});

test("remove method - waits for pending update on the same key", async () => {
    await storage.set("theme", "light");

    const started = deferred();
    const release = deferred();

    const updatePromise = storage.update("theme", async () => {
        started.resolve();
        await release.promise;

        return "dark";
    });

    await started.promise;
    const removePromise = storage.remove("theme");
    await flushMacrotask();
    expect(browser.storage.local.data.theme).toBe("light");
    release.resolve();
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
