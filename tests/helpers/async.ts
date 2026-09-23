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
