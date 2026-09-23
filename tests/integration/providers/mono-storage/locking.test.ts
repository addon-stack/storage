import {deferred, flushMacrotask} from "@tests/support/async";
import MonoStorage from "~/providers/MonoStorage";
import Storage from "~/providers/Storage";

interface BucketState {
    a?: number;
    b?: {x: number} | number | string;
    c?: string;
}

const key = "bucket" as const;

let base: Storage<Record<typeof key, Partial<BucketState>>>;

beforeEach(() => {
    base = new Storage();
});

test("batch set snapshots getter values once before locking the bucket", async () => {
    const mono = new MonoStorage<BucketState, typeof key>(key, base);
    const values: Partial<BucketState> = {};
    let reads = 0;

    Object.defineProperty(values, "a", {
        enumerable: true,
        get: () => {
            reads += 1;

            return reads === 1 ? 1 : undefined;
        },
    });

    await mono.set(values);

    expect(reads).toBe(1);
    await expect(mono.get("a")).resolves.toBe(1);
});

test("update serializes concurrent bucket mutations", async () => {
    const mono = new MonoStorage<BucketState, typeof key>(key, base);

    await mono.set("a", 0);

    const started = deferred();
    const release = deferred();
    const secondStarted = jest.fn();

    const first = mono.update("a", async prev => {
        started.resolve();
        await release.promise;

        return (prev ?? 0) + 1;
    });

    await started.promise;

    const second = mono.update("a", async prev => {
        secondStarted();

        return (prev ?? 0) + 1;
    });

    await flushMacrotask();
    expect(secondStarted).not.toHaveBeenCalled();
    release.resolve();
    await Promise.all([first, second]);

    expect(await mono.get("a")).toBe(2);
});
