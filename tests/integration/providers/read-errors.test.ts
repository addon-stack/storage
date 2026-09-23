import {createBrowserHarness, installBrowserGlobals} from "@addon-core/browser/testing";

import Storage from "~/providers/Storage";

const reads = [
    ["single", (storage: Storage) => storage.get("theme")],
    ["batch", (storage: Storage) => storage.get(["theme"])],
    ["all", (storage: Storage) => storage.getAll()],
] as const;

describe.each(["chrome", "firefox"] as const)("%s read errors", profile => {
    describe.each([false, true])("deferred callback: %s", asynchronous => {
        test.each(reads)("preserves the backend error on %s reads", async (_mode, read) => {
            const harness = createBrowserHarness();
            const restore = installBrowserGlobals(harness, {profile});

            try {
                const storage = new Storage();
                const error = new Error("Storage backend is unavailable");
                const get = harness.storage.local.get;

                if (asynchronous) {
                // Delay dispatch while keeping error delivery in the testkit's lastError channel.
                    get.setImplementation(((keys: string | string[] | null, callback: (items: Record<string, unknown>) => void) => {
                        queueMicrotask(() => {
                            get.failNext(error);
                            harness.chrome.storage.local.get(keys, callback);
                        });
                    }) as typeof chrome.storage.local.get);
                } else {
                    get.failNext(error);
                }

                await expect(read(storage)).rejects.toThrow("Storage backend is unavailable");
                expect(harness.chrome.runtime.lastError).toBeUndefined();
                get.reset();
                await expect(read(storage)).resolves.toEqual(_mode === "single" ? undefined : {});
            } finally {
                harness.reset();
                restore();
            }
        });
    });
});
