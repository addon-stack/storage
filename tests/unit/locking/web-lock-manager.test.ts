import {deferred, flushMacrotask} from "@tests/support/async";
import {createWebLocksMock, type WebLocksMock} from "@tests/support/web-locks";
import WebLockManager from "~/locking/WebLockManager";

class TestWebLockManager extends WebLockManager {
    constructor(private readonly locks: WebLocksMock) {
        super("test");
    }

    protected getLocks(): Navigator["locks"] {
        return this.locks as unknown as Navigator["locks"];
    }
}

describe("createWebLocksMock", () => {
    afterEach(() => {
        jest.restoreAllMocks();
    });

    test("supports both request signatures", async () => {
        const locks = createWebLocksMock();

        await expect(locks.request("implicit", lock => `${lock?.name}:${lock?.mode}`)).resolves.toBe(
            "implicit:exclusive"
        );

        await expect(
            locks.request("explicit", {mode: "shared"}, lock => `${lock?.name}:${lock?.mode}`)
        ).resolves.toBe("explicit:shared");
    });

    test("removes an abort listener immediately when a queued request aborts", async () => {
        const locks = createWebLocksMock();
        let markFirstStarted: VoidFunction | undefined;
        let releaseFirst: VoidFunction | undefined;

        const firstStarted = new Promise<void>(resolve => {
            markFirstStarted = resolve;
        });

        const first = locks.request("settings", async () => {
            markFirstStarted?.();

            await new Promise<void>(resolve => {
                releaseFirst = resolve;
            });
        });

        await firstStarted;

        const controller = new AbortController();
        const removeEventListener = jest.spyOn(controller.signal, "removeEventListener");
        const waiting = locks.request("settings", {signal: controller.signal}, () => "unreachable");

        controller.abort();

        await expect(waiting).rejects.toMatchObject({name: "AbortError"});
        expect(removeEventListener).toHaveBeenCalledWith("abort", expect.any(Function));

        releaseFirst?.();
        await first;
    });
});

describe("WebLockManager", () => {
    const originalLocks = globalThis.navigator.locks;

    afterEach(() => {
        jest.useRealTimers();
        jest.restoreAllMocks();

        Object.defineProperty(globalThis.navigator, "locks", {
            value: originalLocks,
            writable: true,
            enumerable: true,
            configurable: true,
        });
    });

    test("runs tasks sequentially for the same lock name", async () => {
        const lockManager = new TestWebLockManager(createWebLocksMock());
        const steps: string[] = [];

        const started = deferred();
        const release = deferred();
        const secondStarted = jest.fn();

        const first = lockManager.request("profile", async () => {
            steps.push("first:start");
            started.resolve();
            await release.promise;
            steps.push("first:end");
        });

        await started.promise;

        const second = lockManager.request("profile", async () => {
            secondStarted();
            steps.push("second:start");
            steps.push("second:end");
        });

        await flushMacrotask();
        expect(secondStarted).not.toHaveBeenCalled();
        release.resolve();
        await Promise.all([first, second]);

        expect(steps).toEqual(["first:start", "first:end", "second:start", "second:end"]);
    });

    test("rejects when Web Locks API is unavailable", async () => {
        Object.defineProperty(globalThis.navigator, "locks", {
            value: undefined,
            writable: true,
            enumerable: true,
            configurable: true,
        });

        const lockManager = new WebLockManager();

        await expect(lockManager.request("profile", async () => "ok")).rejects.toThrow(
            "Lock-coordinated storage update is unavailable: Web Locks API is not supported in this context."
        );
    });

    test("aborts while waiting for a queued lock", async () => {
        const lockManager = new TestWebLockManager(createWebLocksMock());

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

    test("keeps later requests queued after an earlier waiter aborts", async () => {
        const lockManager = new TestWebLockManager(createWebLocksMock());
        const steps: string[] = [];

        let releaseFirstLock: (() => void) | undefined;
        let markFirstStarted: (() => void) | undefined;

        const firstStarted = new Promise<void>(resolve => {
            markFirstStarted = resolve;
        });

        const firstTask = lockManager.request("settings", async () => {
            steps.push("first:start");
            markFirstStarted?.();

            await new Promise<void>(resolve => {
                releaseFirstLock = resolve;
            });

            steps.push("first:end");
        });

        await firstStarted;

        const controller = new AbortController();

        const abortedTask = lockManager.request(
            "settings",
            async () => {
                steps.push("aborted:unexpected");
            },
            {signal: controller.signal}
        );

        controller.abort();
        await expect(abortedTask).rejects.toMatchObject({name: "AbortError"});

        const laterTask = lockManager.request("settings", async () => {
            steps.push("later:start");
        });

        await Promise.resolve();
        await Promise.resolve();
        expect(steps).toEqual(["first:start"]);

        releaseFirstLock?.();
        await Promise.all([firstTask, laterTask]);

        expect(steps).toEqual(["first:start", "first:end", "later:start"]);
    });

    test("aborts when lock wait exceeds timeout", async () => {
        jest.useFakeTimers();

        const lockManager = new TestWebLockManager(createWebLocksMock());

        let releaseFirstLock: (() => void) | undefined;

        const firstTask = lockManager.request("settings", async () => {
            await new Promise<void>(resolve => {
                releaseFirstLock = resolve;
            });
        });

        const waitingTask = lockManager.request("settings", async () => "unreachable", {timeout: 5});

        jest.advanceTimersByTime(5);
        await expect(waitingTask).rejects.toMatchObject({name: "AbortError"});
        expect(jest.getTimerCount()).toBe(0);

        releaseFirstLock?.();
        await firstTask;
    });

    test("cleans timeout and external abort listener when the lock is granted", async () => {
        jest.useFakeTimers();

        const lockManager = new TestWebLockManager(createWebLocksMock());
        const controller = new AbortController();
        const removeEventListener = jest.spyOn(controller.signal, "removeEventListener");

        let releaseTask: (() => void) | undefined;
        let markTaskStarted: (() => void) | undefined;

        const taskStarted = new Promise<void>(resolve => {
            markTaskStarted = resolve;
        });

        const task = lockManager.request(
            "settings",
            async () => {
                markTaskStarted?.();

                await new Promise<void>(resolve => {
                    releaseTask = resolve;
                });

                return "completed";
            },
            {signal: controller.signal, timeout: 1_000}
        );

        await taskStarted;

        expect(jest.getTimerCount()).toBe(0);
        expect(removeEventListener).toHaveBeenCalledWith("abort", expect.any(Function));

        controller.abort();
        jest.advanceTimersByTime(1_000);
        releaseTask?.();

        await expect(task).resolves.toBe("completed");
    });

    test("cleans timeout and external abort listener when lock acquisition is aborted", async () => {
        jest.useFakeTimers();

        const lockManager = new TestWebLockManager(createWebLocksMock());
        let releaseFirstLock: (() => void) | undefined;

        const firstTask = lockManager.request("settings", async () => {
            await new Promise<void>(resolve => {
                releaseFirstLock = resolve;
            });
        });

        const controller = new AbortController();
        const removeEventListener = jest.spyOn(controller.signal, "removeEventListener");

        const waitingTask = lockManager.request("settings", async () => "unreachable", {
            signal: controller.signal,
            timeout: 1_000,
        });

        controller.abort();

        await expect(waitingTask).rejects.toMatchObject({name: "AbortError"});
        expect(jest.getTimerCount()).toBe(0);
        expect(removeEventListener).toHaveBeenCalledWith("abort", expect.any(Function));

        releaseFirstLock?.();
        await firstTask;
    });

    test("cleans timeout and external abort listener when the lock request rejects", async () => {
        jest.useFakeTimers();

        const locks = {
            request: jest.fn().mockRejectedValue(new Error("Lock backend failed")),
        } as unknown as WebLocksMock;

        const lockManager = new TestWebLockManager(locks);
        const controller = new AbortController();
        const removeEventListener = jest.spyOn(controller.signal, "removeEventListener");

        await expect(
            lockManager.request("settings", async () => "unreachable", {
                signal: controller.signal,
                timeout: 1_000,
            })
        ).rejects.toThrow("Lock backend failed");

        expect(jest.getTimerCount()).toBe(0);
        expect(removeEventListener).toHaveBeenCalledWith("abort", expect.any(Function));
    });

    test("releases the lock after a task failure", async () => {
        const lockManager = new TestWebLockManager(createWebLocksMock());

        await expect(
            lockManager.request("settings", async () => {
                throw new Error("Unexpected storage failure");
            })
        ).rejects.toThrow("Unexpected storage failure");

        await expect(lockManager.request("settings", async () => "recovered")).resolves.toBe("recovered");
    });
});
