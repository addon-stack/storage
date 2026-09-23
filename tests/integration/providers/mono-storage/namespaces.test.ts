import {browser} from "@tests/support/browser";
import MonoStorage from "~/providers/MonoStorage";
import Storage from "~/providers/Storage";

interface BucketState {
    a?: number;
    b?: {x: number} | number | string;
    c?: string;
}

const key = "bucket" as const;

test("logical keys containing the namespace separator remain inside the bucket", async () => {
    interface ColonKeyState {
        "feature:enabled"?: number;
    }

    const logicalKey = "feature:enabled" as const;
    const underlying = new Storage<Record<typeof key, Partial<ColonKeyState>>>();
    const mono = new MonoStorage<ColonKeyState, typeof key>(key, underlying);

    await mono.set(logicalKey, 1);
    await expect(mono.get(logicalKey)).resolves.toBe(1);

    await mono.update(logicalKey, previous => (previous ?? 0) + 1);
    await expect(mono.get(logicalKey)).resolves.toBe(2);
    await expect(browser.storage.local.data[key]).toEqual({[logicalKey]: 2});

    await mono.remove(logicalKey);
    await expect(mono.get(logicalKey)).resolves.toBeUndefined();
    await expect(browser.storage.local.data[key]).toBeUndefined();
});

test("a prototype-like physical bucket key is absent until it is explicitly stored", async () => {
    const prototypeKey = "toString" as const;
    const underlying = new Storage<Record<typeof prototypeKey, Partial<BucketState>>>();
    const mono = new MonoStorage<BucketState, typeof prototypeKey>(prototypeKey, underlying);

    await expect(mono.get("a")).resolves.toBeUndefined();
    await mono.set("a", 1);
    await expect(mono.get("a")).resolves.toBe(1);
});
