import {browser} from "@tests/support/browser";
import {StorageCorruptionError} from "~/errors";
import SecureStorage from "~/providers/SecureStorage";

interface SecureBatchState {
    accessToken?: string;
    refreshToken?: string;
    attempts?: number;
}

describe("corrupted values", () => {
    test("single, batch, and getAll reads reject instead of returning defaults", async () => {
        const storage = new SecureStorage<SecureBatchState>({namespace: "corrupt"});
        const fullKey = "secure:corrupt:accessToken";
        await chrome.storage.local.set({[fullKey]: ""});

        await expect(storage.get("accessToken")).rejects.toBeInstanceOf(StorageCorruptionError);

        await expect(storage.get(["accessToken", "attempts"] as const)).rejects.toBeInstanceOf(
            StorageCorruptionError
        );

        await expect(storage.getAll()).rejects.toBeInstanceOf(StorageCorruptionError);
    });

    test("a present undefined storage property is corruption while a missing property is absent", async () => {
        const storage = new SecureStorage<SecureBatchState>({namespace: "corrupt-undefined"});
        const fullKey = "secure:corrupt-undefined:accessToken";
        const getSpy = browser.storage.local.get;

        getSpy.queueResult({[fullKey]: undefined}, {[fullKey]: undefined}, {[fullKey]: undefined});

        await expect(storage.get("accessToken")).rejects.toBeInstanceOf(StorageCorruptionError);
        await expect(storage.get(["accessToken"] as const)).rejects.toBeInstanceOf(StorageCorruptionError);
        await expect(storage.getAll()).rejects.toBeInstanceOf(StorageCorruptionError);

        await expect(storage.get("accessToken")).resolves.toBeUndefined();
    });
});
