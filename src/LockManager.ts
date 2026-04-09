import type {StorageLocker, StorageLockOptions} from "./types";

export default class LockManager implements StorageLocker {
    constructor(protected readonly prefix: string = "storage") {}

    public async request<T>(name: string, task: () => Promise<T>, options: StorageLockOptions = {}): Promise<T> {
        const locks = this.getLocks();
        const signal = this.createSignal(options);

        return await locks.request(this.getLockName(name), {mode: "exclusive", signal}, async () => await task());
    }

    protected getLockName(name: string): string {
        return `${this.prefix}:${name}`;
    }

    protected getLocks(): Navigator["locks"] {
        const locks = globalThis.navigator?.locks;

        if (!locks?.request) {
            throw new Error("Atomic storage update is unavailable: Web Locks API is not supported in this context.");
        }

        return locks;
    }

    protected createSignal({signal, timeout}: StorageLockOptions): AbortSignal | undefined {
        if (timeout === undefined) {
            return signal;
        }

        const controller = new AbortController();
        const timeoutId = globalThis.setTimeout(() => controller.abort(), timeout);

        const cleanup = () => globalThis.clearTimeout(timeoutId);

        controller.signal.addEventListener("abort", cleanup, {once: true});

        if (!signal) {
            return controller.signal;
        }

        if (signal.aborted) {
            controller.abort(signal.reason);
            return controller.signal;
        }

        signal.addEventListener(
            "abort",
            () => {
                controller.abort(signal.reason);
            },
            {once: true}
        );

        return controller.signal;
    }
}
