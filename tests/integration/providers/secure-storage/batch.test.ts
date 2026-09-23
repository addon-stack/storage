import {browser} from "@tests/support/browser";
import SecureStorage from "~/providers/SecureStorage";

interface SecureBatchState {
    accessToken?: string;
    refreshToken?: string;
    attempts?: number;
}

describe("batch overloads", () => {
    test("batch set encrypts namespaced values into one native write and batch get decrypts one native read", async () => {
        const storage = new SecureStorage<SecureBatchState>({namespace: "auth"});
        const setSpy = browser.storage.local.set;
        setSpy.reset();

        await storage.set({accessToken: "access", refreshToken: "refresh"});

        expect(setSpy.calls).toHaveLength(1);

        const setPayload = setSpy.calls[0]!.args[0] as Record<string, unknown>;
        expect(Object.keys(setPayload)).toEqual(["secure:auth:accessToken", "secure:auth:refreshToken"]);
        expect(typeof setPayload["secure:auth:accessToken"]).toBe("string");
        expect(typeof setPayload["secure:auth:refreshToken"]).toBe("string");
        expect(setPayload["secure:auth:accessToken"]).not.toBe("access");
        expect(setPayload["secure:auth:refreshToken"]).not.toBe("refresh");

        const getSpy = browser.storage.local.get;
        getSpy.reset();

        await expect(storage.get(["accessToken", "refreshToken", "attempts"] as const)).resolves.toEqual({
            accessToken: "access",
            refreshToken: "refresh",
        });

        expect(getSpy.calls).toHaveLength(1);

        expect(getSpy.calls).toContainEqual(expect.objectContaining({
            args: [["secure:auth:accessToken", "secure:auth:refreshToken", "secure:auth:attempts"]],
            callback: expect.any(Function),
        }));
    });

    test("batch set performs no storage write when any encryption fails", async () => {
        const storage = new SecureStorage<SecureBatchState>();
        const encryptMock = jest.spyOn(crypto.subtle, "encrypt");
        const defaultImplementation = encryptMock.getMockImplementation();
        const setSpy = browser.storage.local.set;

        expect(defaultImplementation).toBeDefined();
        encryptMock.mockImplementationOnce(defaultImplementation as (...args: any[]) => any);
        encryptMock.mockRejectedValueOnce(new Error("encryption failed"));
        setSpy.reset();

        await expect(storage.set({accessToken: "access", refreshToken: "refresh"})).rejects.toThrow(
            "encryption failed"
        );

        expect(setSpy.calls).toHaveLength(0);
        await expect(storage.get(["accessToken", "refreshToken"] as const)).resolves.toEqual({});
    });

    test("batch set rejects undefined before encrypting any value", async () => {
        const storage = new SecureStorage<SecureBatchState>();
        const encryptSpy = jest.spyOn(crypto.subtle, "encrypt");
        const setSpy = browser.storage.local.set;
        encryptSpy.mockClear();
        setSpy.reset();

        await expect(
            storage.set({accessToken: "access", refreshToken: undefined} as Partial<SecureBatchState>)
        ).rejects.toThrow(TypeError);

        expect(encryptSpy).not.toHaveBeenCalled();
        expect(setSpy.calls).toHaveLength(0);
    });

    test("batch update compares decrypted values and encrypts only changed keys before one native write", async () => {
        const storage = new SecureStorage<SecureBatchState>({namespace: "auth"});
        await storage.set({accessToken: "old", refreshToken: "same", attempts: 1});

        const encryptSpy = jest.spyOn(crypto.subtle, "encrypt");
        const setSpy = browser.storage.local.set;
        const removeSpy = browser.storage.local.remove;
        encryptSpy.mockClear();
        setSpy.reset();
        removeSpy.reset();

        const result = await storage.update(
            ["accessToken", "refreshToken", "attempts"] as const,
            prev => ({
                accessToken: `${prev.accessToken}:next`,
                refreshToken: "same",
                attempts: 2,
            })
        );

        expect(result).toEqual({accessToken: "old:next", refreshToken: "same", attempts: 2});
        expect(encryptSpy).toHaveBeenCalledTimes(2);
        expect(setSpy.calls).toHaveLength(1);
        expect(Object.keys(setSpy.calls[0]!.args[0] as object)).toEqual(["secure:auth:accessToken", "secure:auth:attempts"]);
        expect(removeSpy.calls).toHaveLength(0);
    });

    test("batch update does not encrypt or write an equal patch", async () => {
        const storage = new SecureStorage<SecureBatchState>();
        await storage.set({accessToken: "same", attempts: 1});

        const encryptSpy = jest.spyOn(crypto.subtle, "encrypt");
        const setSpy = browser.storage.local.set;
        const removeSpy = browser.storage.local.remove;
        encryptSpy.mockClear();
        setSpy.reset();
        removeSpy.reset();

        await expect(
            storage.update(["accessToken", "attempts"] as const, () => ({accessToken: "same", attempts: 1}))
        ).resolves.toEqual({accessToken: "same", attempts: 1});

        expect(encryptSpy).not.toHaveBeenCalled();
        expect(setSpy.calls).toHaveLength(0);
        expect(removeSpy.calls).toHaveLength(0);
    });

    test("aggregate comparer receives decrypted snapshots and can skip the whole patch", async () => {
        const storage = new SecureStorage<SecureBatchState>({namespace: "auth"});
        await storage.set({accessToken: "old", refreshToken: "remove", attempts: 1});

        const compare = jest.fn(() => true);
        const encryptSpy = jest.spyOn(crypto.subtle, "encrypt");
        const setSpy = browser.storage.local.set;
        const removeSpy = browser.storage.local.remove;
        encryptSpy.mockClear();
        setSpy.reset();
        removeSpy.reset();

        const result = await storage.update(
            ["accessToken", "refreshToken", "attempts"] as const,
            () => ({accessToken: "new", refreshToken: undefined}),
            {compare}
        );

        expect(compare).toHaveBeenCalledTimes(1);

        expect(compare).toHaveBeenCalledWith(
            {accessToken: "old", refreshToken: "remove", attempts: 1},
            {accessToken: "new", attempts: 1}
        );

        expect(result).toEqual({accessToken: "old", refreshToken: "remove", attempts: 1});
        expect(encryptSpy).not.toHaveBeenCalled();
        expect(setSpy.calls).toHaveLength(0);
        expect(removeSpy.calls).toHaveLength(0);
    });

    test("aggregate comparer can force every explicit value to be encrypted and written", async () => {
        const storage = new SecureStorage<SecureBatchState>({namespace: "auth"});
        await storage.set({accessToken: "same", attempts: 1});

        const compare = jest.fn(() => false);
        const encryptSpy = jest.spyOn(crypto.subtle, "encrypt");
        const setSpy = browser.storage.local.set;
        encryptSpy.mockClear();
        setSpy.reset();

        const result = await storage.update(
            ["accessToken", "attempts"] as const,
            () => ({accessToken: "same", attempts: 2}),
            {compare}
        );

        expect(compare).toHaveBeenCalledWith(
            {accessToken: "same", attempts: 1},
            {accessToken: "same", attempts: 2}
        );

        expect(result).toEqual({accessToken: "same", attempts: 2});
        expect(encryptSpy).toHaveBeenCalledTimes(2);
        expect(setSpy.calls).toHaveLength(1);
        expect(Object.keys(setSpy.calls[0]!.args[0] as object)).toEqual(["secure:auth:accessToken", "secure:auth:attempts"]);
    });

    test("batch update encrypts writes before removing deleted keys in a mixed patch", async () => {
        const storage = new SecureStorage<SecureBatchState>({namespace: "auth"});
        await storage.set({accessToken: "old", refreshToken: "remove"});

        const encryptSpy = jest.spyOn(crypto.subtle, "encrypt");
        const setSpy = browser.storage.local.set;
        const removeSpy = browser.storage.local.remove;
        encryptSpy.mockClear();
        setSpy.reset();
        removeSpy.reset();

        const result = await storage.update(["accessToken", "refreshToken"] as const, () => ({
            accessToken: "new",
            refreshToken: undefined,
        }));

        expect(result).toEqual({accessToken: "new"});
        expect(encryptSpy).toHaveBeenCalledTimes(1);
        expect(setSpy.calls).toHaveLength(1);
        expect(Object.keys(setSpy.calls[0]!.args[0] as object)).toEqual(["secure:auth:accessToken"]);
        expect(removeSpy.calls).toHaveLength(1);

        expect(removeSpy.calls).toContainEqual(expect.objectContaining({
            args: [["secure:auth:refreshToken"]],
            callback: expect.any(Function),
        }));

        expect(setSpy.calls[0]!.sequence).toBeLessThan(removeSpy.calls[0]!.sequence);
    });
});
