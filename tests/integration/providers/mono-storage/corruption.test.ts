import {browser} from "@tests/support/browser";
import {StorageCorruptionError} from "~/errors";
import MonoStorage from "~/providers/MonoStorage";
import SecureStorage from "~/providers/SecureStorage";
import Storage from "~/providers/Storage";

interface BucketState {
    a?: number;
    b?: {x: number} | number | string;
    c?: string;
}

const key = "bucket" as const;

let base: Storage<Record<typeof key, Partial<BucketState>>>;

let secureBase: SecureStorage<Record<typeof key, Partial<BucketState>>>;

beforeEach(() => {
    base = new Storage();
    secureBase = new SecureStorage();
});

describe("corrupted buckets", () => {
    test.each([null, "invalid", [], 42])("rejects a present non-record bucket %#", async bucket => {
        const mono = new MonoStorage<BucketState, typeof key>(key, base);
        await chrome.storage.local.set({[key]: bucket});

        await expect(mono.getAll()).rejects.toBeInstanceOf(StorageCorruptionError);
        await expect(mono.set("a", 1)).rejects.toBeInstanceOf(StorageCorruptionError);
        await expect(mono.update("a", () => 1)).rejects.toBeInstanceOf(StorageCorruptionError);
        await expect(mono.remove("a")).rejects.toBeInstanceOf(StorageCorruptionError);
    });

    test("clear removes a corrupted encrypted bucket without decrypting it", async () => {
        const mono = new MonoStorage<BucketState, typeof key>(key, secureBase as any);
        const fullKey = "secure::bucket";
        await chrome.storage.local.set({[fullKey]: "corrupted:bucket"});
        const decryptSpy = jest.spyOn(crypto.subtle, "decrypt");
        decryptSpy.mockClear();

        await mono.clear();

        expect(browser.storage.local.data["secure:" + ":" + key]).toBeUndefined();
        expect(decryptSpy).not.toHaveBeenCalled();
    });
});
