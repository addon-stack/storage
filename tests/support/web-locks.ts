export type WebLocksMock = Pick<LockManager, "request">;

const createAbortError = (): Error => {
    const error = new Error("The lock request was aborted.");
    error.name = "AbortError";

    return error;
};

export const createWebLocksMock = (): WebLocksMock => {
    const tails = new Map<string, Promise<void>>();

    const request = async <T>(
        name: string,
        optionsOrCallback: LockOptions | LockGrantedCallback<T>,
        maybeCallback?: LockGrantedCallback<T>
    ): Promise<T> => {
        const callback = typeof optionsOrCallback === "function" ? optionsOrCallback : maybeCallback;
        const options = typeof optionsOrCallback === "function" ? {} : optionsOrCallback;

        if (!callback) {
            throw new TypeError("Lock callback is required.");
        }

        const signal = options.signal;

        if (signal?.aborted) {
            throw createAbortError();
        }

        const previous = tails.get(name) ?? Promise.resolve();
        let releaseCurrent: VoidFunction | undefined;

        const current = new Promise<void>(resolve => {
            releaseCurrent = resolve;
        });

        const tail = previous.then(() => current);

        tails.set(name, tail);

        try {
            await new Promise<void>((resolve, reject) => {
                let settled = false;

                const cleanup = () => {
                    signal?.removeEventListener("abort", onAbort);
                };

                const resolveOnce = () => {
                    if (settled) {
                        return;
                    }

                    settled = true;
                    cleanup();
                    resolve();
                };

                const rejectOnce = (reason: unknown) => {
                    if (settled) {
                        return;
                    }

                    settled = true;
                    cleanup();
                    reject(reason);
                };

                const onAbort = () => rejectOnce(createAbortError());

                signal?.addEventListener("abort", onAbort, {once: true});

                void previous.then(
                    () => {
                        if (signal?.aborted) {
                            rejectOnce(createAbortError());

                            return;
                        }

                        resolveOnce();
                    },
                    rejectOnce
                );
            });

            return await callback({name, mode: options.mode ?? "exclusive"} as Lock);
        } finally {
            releaseCurrent?.();

            void tail.then(() => {
                if (tails.get(name) === tail) {
                    tails.delete(name);
                }
            });
        }
    };

    return {
        request: request as WebLocksMock["request"],
    };
};
