import {withBrowser} from "@tests/support/browser";
import MonoStorage from "~/providers/MonoStorage";
import Storage from "~/providers/Storage";

const getAllFromArea = async (area: chrome.storage.AreaName) => chrome.storage[area].get(null);

describe("static factory methods", () => {
    describe("make()", () => {
        test("Storage.make() returns provider by default and MonoStorage with key", async () => {
            const s = Storage.make();
            expect(s).toBeInstanceOf(Storage);

            const mono = Storage.make({key: "bucket"});
            expect(mono).toBeInstanceOf(MonoStorage);

            // default area is local; write and verify stored in local only
            await (s as Storage<any>).set("a" as any, 1 as any);

            const localAll = await getAllFromArea("local");
            expect(localAll["a"]).toBe(1);

            {
                const syncAll = await getAllFromArea("sync");
                expect(syncAll["a"]).toBeUndefined();
            }

            {
                const managedAll = await getAllFromArea("managed");
                expect(managedAll["a"]).toBeUndefined();
            }

            {
                const sessionAll = await getAllFromArea("session");
                expect(sessionAll["a"]).toBeUndefined();
            }
        });
    });

    describe("Area shortcuts (Local/Sync/Session/Managed)", () => {
        test("Storage.Local() writes to local area and returns Storage/MonoStorage accordingly", async () => {
            const s = Storage.Local();
            expect(s).toBeInstanceOf(Storage);
            await (s as Storage<any>).set("x" as any, 10 as any);

            const localAll = await getAllFromArea("local");
            expect(localAll["x"]).toBe(10);

            {
                const syncAll = await getAllFromArea("sync");
                expect(syncAll["x"]).toBeUndefined();
            }

            const mono = Storage.Local({key: "bucket"});
            expect(mono).toBeInstanceOf(MonoStorage);
            await (mono as unknown as MonoStorage<any, any>).set("a" as any, 1 as any);
            const localAll2 = await getAllFromArea("local");
            expect(localAll2["bucket"]).toEqual({a: 1});
        });

        test("Storage.Sync() writes to sync area", async () => {
            const s = Storage.Sync();
            expect(s).toBeInstanceOf(Storage);
            await (s as Storage<any>).set("x" as any, 10 as any);

            const syncAll = await getAllFromArea("sync");
            expect(syncAll["x"]).toBe(10);

            const localAll = await getAllFromArea("local");
            expect(localAll["x"]).toBeUndefined();

            const mono = Storage.Sync({key: "bucket"});
            expect(mono).toBeInstanceOf(MonoStorage);
            await (mono as unknown as MonoStorage<any, any>).set("a" as any, 1 as any);
            const syncAll2 = await getAllFromArea("sync");
            expect(syncAll2["bucket"]).toEqual({a: 1});
        });

        test("Storage.Managed() reads policy data and rejects writes", async () => {
            await withBrowser({storage: {managed: {m: 7}}}, async fixture => {
                const storage = Storage.Managed<{m: number}>();
                expect(storage).toBeInstanceOf(Storage);
                await expect(storage.get("m")).resolves.toBe(7);
                await expect(storage.set("m", 8)).rejects.toThrow("managed storage is read-only");
                expect(fixture.storage.managed.data).toEqual({m: 7});
                expect(fixture.storage.local.data).toEqual({});
            });
        });

        test("Storage.Session() writes to session area if available", async () => {
            const s = Storage.Session<{s?: number}>();
            expect(s).toBeInstanceOf(Storage);
            await (s as Storage<any>).set("s" as any, 5 as any);

            const sessionAll = await getAllFromArea("session");
            expect(sessionAll["s"]).toBe(5);

            const localAll = await getAllFromArea("local");
            expect(localAll["s"]).toBeUndefined();
        });
    });
});
