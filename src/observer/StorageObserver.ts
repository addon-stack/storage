import {dequal} from "dequal/lite";

import Storage from "../providers/Storage";
import {createRecord, hasOwn, setRecordValue} from "../utils";

import {type StorageObserverDriver, type StorageObserverScope, type StorageObserverSnapshot, StorageStatus} from "./types";

import type {StorageChanges, StorageState} from "../types";

interface KeySnapshot {
    value: unknown;
    exists: boolean | undefined;
    status: StorageStatus;
    error: unknown;
    pendingMutationCount: number;
    mutationError: unknown;
}

interface Entry {
    snapshot: KeySnapshot;
    users: number;
    revision: number;
    readId: number;
    mutationId: number;
    pending?: Promise<void>;
}

const empty: KeySnapshot = {
    value: undefined,
    exists: undefined,
    status: StorageStatus.Loading,
    error: undefined,
    pendingMutationCount: 0,
    mutationError: undefined,
};

const resolveSnapshot = (previous: KeySnapshot, value: unknown): KeySnapshot => {
    const equal = dequal(previous.value, value);
    const exists = value !== undefined;

    if (equal && previous.exists === exists && previous.status === StorageStatus.Ready) {
        return previous;
    }

    return {
        ...previous,
        value: equal ? previous.value : value,
        exists,
        status: StorageStatus.Ready,
        error: undefined,
    };
};

/** One native subscription per provider; only retained keys are cached. */
export class StorageObserver<State extends StorageState = StorageState> {
    // Provider identity determines the schema; the shared registry holds all schemas.
    private static readonly observers = new WeakMap<object, StorageObserver<any>>();
    private static defaultObserver?: StorageObserver<any>;

    private entries = new Map<string, Entry>();
    private listeners = new Set<() => void>();
    private stop?: () => void;
    private connection = 0;
    private failure?: {error: unknown};
    private mutationId = 0;

    constructor(private provider?: StorageObserverDriver<State>) {}

    /** Returns the shared observer for a provider, or the default local observer. */
    static get<State extends StorageState = StorageState>(
        provider?: StorageObserverDriver<State>
    ): StorageObserver<State> {
        if (!provider) {
            StorageObserver.defaultObserver ??= new StorageObserver<State>();

            return StorageObserver.defaultObserver;
        }

        let observer = StorageObserver.observers.get(provider);

        if (!observer) {
            observer = new StorageObserver(provider);
            StorageObserver.observers.set(provider, observer);
        }

        return observer;
    }

    private getProvider(): StorageObserverDriver<State> {
        this.provider ??= Storage.Local<State>();

        return this.provider;
    }

    private notify(): void {
        for (const listener of this.listeners) {
            listener();
        }
    }

    private connect(): void {
        if (this.stop || this.failure || this.entries.size === 0) {
            return;
        }

        const connection = ++this.connection;

        try {
            const stop = this.getProvider().subscribe(
                changes => {
                    if (connection === this.connection) {
                        this.acceptChanges(changes);
                    }
                },
                {
                    onError: error => {
                        if (connection === this.connection) {
                            this.fail(error);
                        }
                    },
                }
            );

            if (connection === this.connection) {
                this.stop = stop;
            } else {
                stop();
            }
        } catch (error) {
            this.fail(error);
        }
    }

    private fail(error: unknown): void {
        this.failure = {error};
        ++this.connection;
        this.stop?.();
        this.stop = undefined;

        for (const entry of this.entries.values()) {
            ++entry.readId;
            entry.pending = undefined;
            entry.snapshot = {...entry.snapshot, status: StorageStatus.Error, error};
        }

        this.notify();
    }

    private acceptChanges(changes: StorageChanges): void {
        let changed = false;

        for (const key of Object.keys(changes)) {
            const entry = this.entries.get(key);
            const change = changes[key];

            if (!entry || !change) {
                continue;
            }

            ++entry.revision;
            const previous = entry.snapshot;
            entry.snapshot = resolveSnapshot(previous, change.newValue);
            changed ||= entry.snapshot !== previous;
        }

        if (changed) {
            this.notify();
        }
    }

    private retain(keys: readonly string[]): () => void {
        for (const key of keys) {
            let entry = this.entries.get(key);

            if (!entry) {
                entry = {
                    snapshot: this.failure ? {...empty, status: StorageStatus.Error, error: this.failure.error} : empty,
                    users: 0,
                    revision: 0,
                    readId: 0,
                    mutationId: 0,
                };

                this.entries.set(key, entry);
            }

            ++entry.users;
        }

        this.connect();
        let released = false;

        return () => {
            if (released) {
                return;
            }

            released = true;

            for (const key of keys) {
                const entry = this.entries.get(key);

                if (entry) {
                    --entry.users;
                }
            }

            // Reuse the current read and subscription when consumers reconnect in the same turn.
            void Promise.resolve().then(() => {
                for (const [key, entry] of this.entries) {
                    if (entry.users === 0) {
                        this.entries.delete(key);
                    }
                }

                if (this.entries.size === 0) {
                    ++this.connection;
                    this.stop?.();
                    this.stop = undefined;
                    this.failure = undefined;
                }
            });
        };
    }

    private async read(keys: readonly string[], force: boolean): Promise<void> {
        if (this.failure) {
            throw this.failure.error;
        }

        const waiting: Promise<void>[] = [];

        const requests = keys.flatMap(key => {
            const entry = this.entries.get(key);

            if (!entry) {
                return [];
            }

            if (!force) {
                if (entry.pending) {
                    waiting.push(entry.pending);

                    return [];
                }

                if (entry.snapshot.status === StorageStatus.Ready) {
                    return [];
                }
            }

            if (entry.snapshot.status === StorageStatus.Error && entry.snapshot.exists === undefined) {
                entry.snapshot = {...entry.snapshot, status: StorageStatus.Loading, error: undefined};
            }

            return [{key, entry, revision: entry.revision, readId: ++entry.readId}];
        });

        if (requests.length === 0) {
            await Promise.all(waiting);

            return;
        }

        const isCurrent = ({key, entry, revision, readId}: (typeof requests)[number]) =>
            this.entries.get(key) === entry && entry.readId === readId && entry.revision === revision;

        const pending = Promise.resolve().then(async () => {
            try {
                const values = await this.getProvider().get(requests.map(({key}) => key));

                if (this.failure) {
                    throw this.failure.error;
                }

                for (const request of requests) {
                    if (!isCurrent(request)) {
                        continue;
                    }

                    const {key, entry} = request;
                    const value = hasOwn(values, key) ? values[key] : undefined;
                    entry.snapshot = resolveSnapshot(entry.snapshot, value);
                }
            } catch (error) {
                for (const request of requests) {
                    if (isCurrent(request)) {
                        request.entry.snapshot = {
                            ...request.entry.snapshot,
                            status: StorageStatus.Error,
                            error,
                        };
                    }
                }

                throw error;
            } finally {
                for (const {entry} of requests) {
                    if (entry.pending === pending) {
                        entry.pending = undefined;
                    }
                }

                this.notify();
            }
        });

        for (const {entry} of requests) {
            entry.pending = pending;
        }

        this.notify();
        await Promise.all([...waiting, pending]);
    }

    async refresh(keys: readonly (keyof State & string)[]): Promise<void> {
        const release = this.retain(keys);

        try {
            this.failure = undefined;
            this.connect();
            await this.read(keys, true);
        } finally {
            release();
        }
    }

    async mutate<Result>(
        keys: readonly (keyof State & string)[],
        operation: (provider: StorageObserverDriver<State>) => Promise<Result>
    ): Promise<Result> {
        const release = this.retain(keys);
        const mutationId = ++this.mutationId;
        const entries = keys.map(key => this.entries.get(key) as Entry);

        for (const entry of entries) {
            entry.mutationId = mutationId;

            entry.snapshot = {
                ...entry.snapshot,
                pendingMutationCount: entry.snapshot.pendingMutationCount + 1,
                mutationError: undefined,
            };
        }

        this.notify();

        try {
            return await operation(this.getProvider());
        } catch (error) {
            for (const entry of entries) {
                if (entry.mutationId === mutationId) {
                    entry.snapshot = {...entry.snapshot, mutationError: error};
                }
            }

            throw error;
        } finally {
            // Re-read actual storage, including partial writes. Read errors belong to
            // `error`; they must not replace a mutation's result or original error.
            await this.refresh(keys).catch(() => undefined);

            for (const entry of entries) {
                entry.snapshot = {...entry.snapshot, pendingMutationCount: entry.snapshot.pendingMutationCount - 1};
            }

            this.notify();
            release();
        }
    }

    select(keys: readonly (keyof State & string)[]): StorageObserverScope {
        let previous: KeySnapshot[] | undefined;
        let cachedSnapshot: StorageObserverSnapshot;

        const snapshot = (): StorageObserverSnapshot => {
            if (previous) {
                let unchanged = true;

                for (let index = 0; index < keys.length; ++index) {
                    if ((this.entries.get(keys[index])?.snapshot ?? empty) !== previous[index]) {
                        unchanged = false;
                        break;
                    }
                }

                if (unchanged) {
                    return cachedSnapshot;
                }
            }

            const states = keys.map(key => this.entries.get(key)?.snapshot ?? empty);
            previous = states;
            const value = createRecord<Record<string, unknown>>();
            const exists = createRecord<Record<string, boolean | undefined>>();

            keys.forEach((key, index) => {
                const state = states[index];

                if (state.exists) {
                    setRecordValue(value, key, state.value);
                }

                setRecordValue(exists, key, state.exists);
            });

            const failed = states.find(state => state.status === StorageStatus.Error);

            cachedSnapshot = {
                value,
                exists,
                status: failed
                    ? StorageStatus.Error
                    : states.some(state => state.status === StorageStatus.Loading)
                        ? StorageStatus.Loading
                        : StorageStatus.Ready,
                error: failed?.error,
                isMutating: states.some(state => state.pendingMutationCount > 0),
                mutationError: states.find(state => state.mutationError !== undefined)?.mutationError,
            };

            return cachedSnapshot;
        };

        return {
            snapshot,
            subscribe: (listener: () => void) => {
                const notify = () => listener();
                this.listeners.add(notify);
                // A new consumer retries a failed registration and refreshes every
                // retained key that may have missed events while it was disconnected.
                const retryKeys = this.failure ? [...new Set([...this.entries.keys(), ...keys])] : keys;
                this.failure = undefined;
                const release = this.retain(keys);
                void this.read(retryKeys, false).catch(() => undefined);

                return () => {
                    this.listeners.delete(notify);
                    release();
                };
            },
        };
    }
}
