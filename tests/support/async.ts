export interface UnhandledErrorCapture {
    readonly pending: number;
    runNext(): void;
    restore(): void;
}

export const captureUnhandledErrors = (): UnhandledErrorCapture => {
    const scheduled: VoidFunction[] = [];

    const queueMicrotaskSpy = jest
        .spyOn(globalThis, "queueMicrotask")
        .mockImplementation(callback => scheduled.push(callback));

    let restored = false;

    return {
        get pending(): number {
            return scheduled.length;
        },
        runNext(): void {
            const callback = scheduled.shift();

            if (!callback) {
                throw new Error("No unhandled error is queued.");
            }

            callback();
        },
        restore(): void {
            if (restored) {
                return;
            }

            restored = true;
            queueMicrotaskSpy.mockRestore();
        },
    };
};

export const flushMacrotask = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

export const deferred = <T = void>() => {
    let resolve!: (value: T | PromiseLike<T>) => void;
    let reject!: (reason: unknown) => void;

    const promise = new Promise<T>((yes, no) => {
        resolve = yes; reject = no;
    });

    return {promise, resolve, reject};
};

// Provider subscriptions intentionally detach their formatting queue from native events.
// Wait for the consumer assertion, not an assumed number of event-loop ticks.
export const waitFor = async (assertion: () => void, timeout = 1000): Promise<void> => {
    const deadline = Date.now() + timeout;

    for (;;) {
        try {
            assertion();

            return;
        } catch (error) {
            if (Date.now() >= deadline) throw error;

            await flushMacrotask();
        }
    }
};
