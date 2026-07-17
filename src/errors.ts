import type {StorageState} from "./types";

export class StorageCorruptionError extends Error {
    public readonly provider: string;
    public readonly key: string;
    public readonly cause: unknown;

    constructor(provider: string, key: PropertyKey, cause?: unknown) {
        super(`${provider} contains a corrupted value for key "${String(key)}".`);

        this.name = "StorageCorruptionError";
        this.provider = provider;
        this.key = String(key);
        this.cause = cause;
    }
}

export class StoragePartialUpdateError<T extends StorageState = StorageState> extends Error {
    public readonly appliedSetKeys: readonly (keyof T)[];
    public readonly attemptedRemoveKeys: readonly (keyof T)[];
    public readonly cause: unknown;

    constructor(appliedSetKeys: readonly (keyof T)[], attemptedRemoveKeys: readonly (keyof T)[], cause: unknown) {
        super("Storage batch update was only partially applied: set completed, but remove failed.");

        this.name = "StoragePartialUpdateError";
        this.appliedSetKeys = [...appliedSetKeys];
        this.attemptedRemoveKeys = [...attemptedRemoveKeys];
        this.cause = cause;
    }
}
