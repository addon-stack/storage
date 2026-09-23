import type {StorageProvider, StorageState} from "~/types";

export enum StorageStatus {
    Loading = "loading",
    Ready = "ready",
    Error = "error",
}

/** The storage operations required by the observer and its mutation callbacks. */
export type StorageObserverDriver<State extends StorageState = StorageState> = Pick<
    StorageProvider<State>,
    "get" | "set" | "update" | "remove" | "subscribe"
>;

/** Actual storage state for a selection; consumer defaults are applied by adapters. */
export interface StorageObserverSnapshot {
    readonly value: Readonly<Record<string, unknown>>;
    readonly exists: Readonly<Record<string, boolean | undefined>>;
    readonly status: StorageStatus;
    readonly error: unknown;
    readonly isMutating: boolean;
    readonly mutationError: unknown;
}

/** A scope of selected keys, with snapshot access and its own subscription lifetime. */
export interface StorageObserverScope {
    /** Returns a stable snapshot until the selected state changes. */
    snapshot(): StorageObserverSnapshot;
    /** Retains the selected keys until the returned unsubscribe function is called. */
    subscribe(listener: () => void): () => void;
}
