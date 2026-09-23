import {createBrowserHarness, installBrowserGlobals} from "@addon-core/browser/testing";

import {deferred} from "@tests/support/async";
import {MonoStorage, SecureStorage, Storage} from "~/providers";

import type {StorageProvider} from "~/types";

type State = {count: number; theme: string};
const providers = ["plain", "secure", "mono", "secure-mono"] as const;
const areas = ["local", "sync", "session"] as const;

describe.each(["chrome", "firefox"] as const)("%s provider contracts", profile => {
    describe.each(areas)("%s storage", area => {
        test.each(providers)("%s persists changes and delivers automatic events", async kind => {
            const harness = createBrowserHarness();
            const restore = installBrowserGlobals(harness, {profile, environment: "preserve"});
            let stop = () => {};

            try {
                const options = {area, namespace: "contract"};
                let storage: StorageProvider<State>;

                if (kind === "mono" || kind === "secure-mono") {
                    const base = kind === "mono"
                        ? new Storage<{bucket: Partial<State>}>(options)
                        : new SecureStorage<{bucket: Partial<State>}>(options);

                    storage = new MonoStorage<State, "bucket">("bucket", base);
                } else {
                    storage = kind === "plain" ? new Storage<State>(options) : new SecureStorage<State>(options);
                }

                await storage.set({count: 1, theme: "light"});
                await expect(storage.get(["count", "theme"])).resolves.toEqual({count: 1, theme: "light"});

                const changed = deferred<unknown>();
                const listener = jest.fn(changes => changed.resolve(changes));
                stop = storage.subscribe(listener);
                await storage.update(["count", "theme"], previous => ({count: previous.count! + 1, theme: "dark"}));

                await expect(changed.promise).resolves.toEqual({
                    count: {oldValue: 1, newValue: 2},
                    theme: {oldValue: "light", newValue: "dark"},
                });

                expect(listener).toHaveBeenCalledTimes(1);
                expect(harness.storage.onChanged.listenerCount()).toBe(1);
                stop();
                expect(harness.storage.onChanged.listenerCount()).toBe(0);
                await storage.remove("theme");
                await expect(storage.getAll()).resolves.toEqual({count: 2});
                await storage.clear();
                await expect(storage.getAll()).resolves.toEqual({});
                await harness.storage.flushChanges();
                expect(listener).toHaveBeenCalledTimes(1);

                for (const other of areas.filter(candidate => candidate !== area)) {
                    expect(harness.storage[other].data).toEqual({});
                }
            } finally {
                stop();
                harness.reset();
                restore();
            }
        });
    });
});
