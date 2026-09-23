import MonoStorage from "~/providers/MonoStorage";
import SecureStorage from "~/providers/SecureStorage";

const getAllFromArea = async (area: chrome.storage.AreaName) => chrome.storage[area].get(null);

describe("static factory methods", () => {
    describe("make()", () => {
        test("SecureStorage.make() returns provider by default and MonoStorage with key", async () => {
            const s = SecureStorage.make();
            expect(s).toBeInstanceOf(SecureStorage);

            const mono = SecureStorage.make({key: "bucket"});
            expect(mono).toBeInstanceOf(MonoStorage);

            await (s as SecureStorage<any>).set("a" as any, 1 as any);

            const localAll = await getAllFromArea("local");
            // secure provider stores encrypted value; we just assert key exists
            const secureKey = Object.keys(localAll).find(k => k.endsWith(":a") || k === "secure:a");
            expect(secureKey?.startsWith("secure:")).toBe(true);
        });
    });

    describe("Area shortcuts", () => {
        test("SecureStorage.Local() forwards secureKey to key derivation", async () => {
            const digestSpy = jest.spyOn(crypto.subtle, "digest");
            digestSpy.mockClear();

            const storage = SecureStorage.Local<{theme?: string}>({
                namespace: "factory-secure-key",
                secureKey: "ForwardedSecureKey",
            });

            await storage.set("theme", "dark");

            expect(digestSpy).toHaveBeenCalledTimes(1);

            expect(digestSpy).toHaveBeenCalledWith(
                "SHA-256",
                new TextEncoder().encode("ForwardedSecureKey")
            );
        });

        test("SecureStorage.Session<State>() writes encrypted data to the session area", async () => {
            const storage = SecureStorage.Session<{token?: string}>({secureKey: "SessionSecureKey"});

            await storage.set("token", "session-token");

            const sessionValues = await getAllFromArea("session");
            expect(typeof sessionValues["secure::token"]).toBe("string");

            const localValues = await getAllFromArea("local");
            expect(localValues["secure::token"]).toBeUndefined();
        });

        test("SecureStorage.Local() returns secure provider and MonoStorage with key", async () => {
            const s = SecureStorage.Local();
            expect(s).toBeInstanceOf(SecureStorage);

            await (s as SecureStorage<any>).set("y" as any, 20 as any);
            const localAll = await getAllFromArea("local");
            const hasSecureKey = Object.keys(localAll).some(k => k.startsWith("secure:"));
            expect(hasSecureKey).toBe(true);

            const mono = SecureStorage.Local({key: "bucket"});
            expect(mono).toBeInstanceOf(MonoStorage);
            await (mono as unknown as MonoStorage<any, any>).set("z" as any, 3 as any);
            const localAll2 = await getAllFromArea("local");
            // The physical key is secured with prefix
            const secBucketKey = Object.keys(localAll2).find(k => k.endsWith(":bucket") || k === "secure:bucket");
            expect(secBucketKey?.startsWith("secure:")).toBe(true);
        });
    });
});
