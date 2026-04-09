import LockManager from "./LockManager";

interface TestLocks {
    request<T>(name: string, options: LockOptions, callback: LockGrantedCallback<T>): Promise<T>;
}

const createAbortError = () => {
    const error = new Error("The lock request was aborted.");
    error.name = "AbortError";

    return error;
};

const createTestLocks = (): TestLocks => {
    const queues = new Map<string, Promise<void>>();

    return {
        async request<T>(name: string, options: LockOptions, callback: LockGrantedCallback<T>): Promise<T> {
            const previous = queues.get(name) ?? Promise.resolve();
            let releaseCurrent: (() => void) | undefined;

            const current = new Promise<void>(resolve => {
                releaseCurrent = resolve;
            });

            queues.set(name, previous.then(() => current));

            const waitForTurn = new Promise<void>((resolve, reject) => {
                const onAbort = () => reject(createAbortError());

                options.signal?.addEventListener("abort", onAbort, {once: true});

                previous.then(
                    () => {
                        options.signal?.removeEventListener("abort", onAbort);

                        if (options.signal?.aborted) {
                            reject(createAbortError());
                            return;
                        }

                        resolve();
                    },
                    reject
                );
            });

            try {
                await waitForTurn;
                return await callback({name, mode: options.mode ?? "exclusive"} as Lock);
            } finally {
                releaseCurrent?.();

                if (queues.get(name) === current) {
                    queues.delete(name);
                }
            }
        },
    };
};

class TestLockManager extends LockManager {
    constructor(private readonly locks: TestLocks) {
        super("test");
    }

    protected getLocks(): Navigator["locks"] {
        return this.locks as unknown as Navigator["locks"];
    }
}

describe("LockManager", () => {
    const originalLocks = globalThis.navigator.locks;

    afterEach(() => {
        Object.defineProperty(globalThis.navigator, "locks", {
            value: originalLocks,
            writable: true,
            enumerable: true,
            configurable: true,
        });
    });

    test("runs tasks sequentially for the same lock name", async () => {
        const lockManager = new TestLockManager(createTestLocks());
        const steps: string[] = [];

        await Promise.all([
            lockManager.request("profile", async () => {
                steps.push("first:start");
                await new Promise(resolve => setTimeout(resolve, 10));
                steps.push("first:end");
            }),
            lockManager.request("profile", async () => {
                steps.push("second:start");
                steps.push("second:end");
            }),
        ]);

        expect(steps).toEqual(["first:start", "first:end", "second:start", "second:end"]);
    });

    test("rejects when Web Locks API is unavailable", async () => {
        Object.defineProperty(globalThis.navigator, "locks", {
            value: undefined,
            writable: true,
            enumerable: true,
            configurable: true,
        });

        const lockManager = new LockManager();

        await expect(lockManager.request("profile", async () => "ok")).rejects.toThrow(
            "Atomic storage update is unavailable: Web Locks API is not supported in this context."
        );
    });

    test("aborts while waiting for a queued lock", async () => {
        const lockManager = new TestLockManager(createTestLocks());

        let releaseFirstLock: (() => void) | undefined;

        const firstTask = lockManager.request("settings", async () => {
            await new Promise<void>(resolve => {
                releaseFirstLock = resolve;
            });
        });

        const controller = new AbortController();
        const waitingTask = lockManager.request("settings", async () => "unreachable", {signal: controller.signal});

        controller.abort();

        await expect(waitingTask).rejects.toMatchObject({name: "AbortError"});

        releaseFirstLock?.();
        await firstTask;
    });

    test("aborts when lock wait exceeds timeout", async () => {
        const lockManager = new TestLockManager(createTestLocks());

        let releaseFirstLock: (() => void) | undefined;

        const firstTask = lockManager.request("settings", async () => {
            await new Promise<void>(resolve => {
                releaseFirstLock = resolve;
            });
        });

        const waitingTask = lockManager.request("settings", async () => "unreachable", {timeout: 5});

        await expect(waitingTask).rejects.toMatchObject({name: "AbortError"});

        releaseFirstLock?.();
        await firstTask;
    });

    test("releases the lock after a task failure", async () => {
        const lockManager = new TestLockManager(createTestLocks());

        await expect(
            lockManager.request("settings", async () => {
                throw new Error("Unexpected storage failure");
            })
        ).rejects.toThrow("Unexpected storage failure");

        await expect(lockManager.request("settings", async () => "recovered")).resolves.toBe("recovered");
    });
});
