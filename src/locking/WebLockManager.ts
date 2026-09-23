import type {StorageLocker, StorageLockOptions} from "../types";

interface LockRequestSignal {
    signal: AbortSignal | undefined;
    cleanup: () => void;
}

export default class WebLockManager implements StorageLocker {
    constructor(protected readonly prefix: string = "storage") {}

    public async request<T>(name: string, task: () => Promise<T>, options: StorageLockOptions = {}): Promise<T> {
        const locks = this.getLocks();
        const {signal, cleanup} = this.createSignal(options);

        try {
            return await locks.request(this.getLockName(name), {mode: "exclusive", signal}, async () => {
                cleanup();

                return await task();
            });
        } finally {
            cleanup();
        }
    }

    protected getLockName(name: string): string {
        return `${this.prefix}:${name}`;
    }

    protected getLocks(): Navigator["locks"] {
        const locks = globalThis.navigator?.locks;

        if (!locks?.request) {
            throw new Error(
                "Lock-coordinated storage update is unavailable: Web Locks API is not supported in this context."
            );
        }

        return locks;
    }

    protected createSignal({signal, timeout}: StorageLockOptions): LockRequestSignal {
        if (timeout === undefined) {
            return {signal, cleanup: () => undefined};
        }

        const controller = new AbortController();
        let cleaned = false;

        const onAbort = () => {
            controller.abort(signal?.reason);
            cleanup();
        };

        const timeoutId = globalThis.setTimeout(() => {
            controller.abort();
            cleanup();
        }, timeout);

        const cleanup = () => {
            if (cleaned) {
                return;
            }

            cleaned = true;
            globalThis.clearTimeout(timeoutId);
            signal?.removeEventListener("abort", onAbort);
        };

        if (!signal) {
            return {signal: controller.signal, cleanup};
        }

        if (signal.aborted) {
            controller.abort(signal.reason);
            cleanup();

            return {signal: controller.signal, cleanup};
        }

        signal.addEventListener("abort", onAbort, {once: true});

        return {signal: controller.signal, cleanup};
    }
}
