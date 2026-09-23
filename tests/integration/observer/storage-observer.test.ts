import {deferred, flushMacrotask, waitFor} from "@tests/support/async";
import {browser} from "@tests/support/browser";
import {StorageStatus} from "~/index";
import {StorageObserver, type StorageObserverScope} from "~/observer/index";
import {SecureStorage, Storage} from "~/providers";

import type {StorageSubscribeOptions} from "~/types";

// These tests must work without loading a frontend runtime, directly or transitively.
jest.mock("react", () => {
    throw new Error("StorageObserver must not depend on React");
});

jest.mock("react-dom", () => {
    throw new Error("StorageObserver must not depend on React DOM");
});

type State = {theme: string | null; count: number};

const releases: (() => void)[] = [];

const subscribe = (selection: StorageObserverScope, listener = jest.fn()) => {
    const release = selection.subscribe(listener);
    releases.push(release);

    return release;
};

beforeEach(async () => {
    await chrome.storage.local.clear();
    jest.clearAllMocks();
});

afterEach(async () => {
    for (const release of releases.splice(0)) {
        release();
    }

    await flushMacrotask();
    jest.restoreAllMocks();
});

test("shares observers by provider identity and initializes the default provider lazily", async () => {
    const provider = new Storage<State>();
    expect(StorageObserver.get(provider)).toBe(StorageObserver.get(provider));
    expect(StorageObserver.get(new Storage<State>())).not.toBe(StorageObserver.get(provider));
    const local = jest.spyOn(Storage, "Local");
    const observer = StorageObserver.get();
    expect(StorageObserver.get()).toBe(observer);
    const selection = observer.select(["theme"]);
    expect(selection.snapshot()).toMatchObject({status: StorageStatus.Loading, exists: {theme: undefined}});
    expect(local).not.toHaveBeenCalled();
    subscribe(selection);
    await flushMacrotask();
    expect(local).toHaveBeenCalledTimes(1);

    expect(selection.snapshot()).toMatchObject({
        status: StorageStatus.Ready,
        value: {},
        exists: {theme: false},
    });
});

test("independent consumers share one read and subscription, with stable snapshots of stored values", async () => {
    const provider = new Storage<State>();
    const read = deferred<Partial<State>>();
    const get = jest.spyOn(provider, "get").mockReturnValueOnce(read.promise);
    const connect = jest.spyOn(provider, "subscribe");
    const observer = StorageObserver.get(provider);
    const first = observer.select(["theme", "count"]);
    const second = observer.select(["theme"]);
    const listener = jest.fn();
    expect(get).not.toHaveBeenCalled();
    expect(connect).not.toHaveBeenCalled();
    subscribe(first, listener);
    subscribe(second);

    expect(first.snapshot()).toMatchObject({
        status: StorageStatus.Loading,
        exists: {theme: undefined, count: undefined},
    });

    read.resolve({theme: null});
    await flushMacrotask();
    expect(get).toHaveBeenCalledTimes(1);
    expect(connect).toHaveBeenCalledTimes(1);
    const snapshot = first.snapshot();

    expect(snapshot).toMatchObject({
        status: StorageStatus.Ready,
        value: {theme: null},
        exists: {theme: true, count: false},
    });

    expect(second.snapshot().value).toEqual({theme: null});
    expect(first.snapshot()).toBe(snapshot);
    listener.mockClear();
    browser.storage.onChanged.emit({theme: {oldValue: null, newValue: null}}, "local");
    await flushMacrotask();
    expect(first.snapshot()).toBe(snapshot);
    expect(listener).not.toHaveBeenCalled();
    browser.storage.onChanged.emit({theme: {oldValue: null, newValue: "dark"}}, "local");
    await flushMacrotask();
    expect(first.snapshot().value).toEqual({theme: "dark"});
    expect(second.snapshot().value).toEqual({theme: "dark"});
    expect(listener).toHaveBeenCalled();
});

test("same-turn reconnect reuses pending work and the last unsubscribe releases the cache", async () => {
    const provider = new Storage<State>();
    const read = deferred<Partial<State>>();
    const get = jest.spyOn(provider, "get").mockReturnValueOnce(read.promise);
    const connect = jest.spyOn(provider, "subscribe");
    const selection = StorageObserver.get(provider).select(["theme"]);
    const firstRelease = subscribe(selection);
    firstRelease();
    const lastRelease = subscribe(selection);
    read.resolve({theme: "dark"});
    await flushMacrotask();
    expect(get).toHaveBeenCalledTimes(1);
    expect(connect).toHaveBeenCalledTimes(1);
    expect(browser.storage.onChanged.listenerCount()).toBe(1);
    lastRelease();
    lastRelease();
    await flushMacrotask();
    expect(browser.storage.onChanged.listenerCount()).toBe(0);

    expect(selection.snapshot()).toMatchObject({
        status: StorageStatus.Loading,
        value: {},
        exists: {theme: undefined},
    });

    subscribe(selection);
    await flushMacrotask();
    expect(get).toHaveBeenCalledTimes(2);
    expect(connect).toHaveBeenCalledTimes(2);
    expect(selection.snapshot()).toMatchObject({status: StorageStatus.Ready, exists: {theme: false}});
});

test("a deletion event wins over an older pending read", async () => {
    const provider = new Storage<State>();
    const read = deferred<Partial<State>>();
    jest.spyOn(provider, "get").mockReturnValueOnce(read.promise);
    const selection = StorageObserver.get(provider).select(["theme", "count"]);
    subscribe(selection);
    await flushMacrotask();
    browser.storage.onChanged.emit({theme: {oldValue: "dark", newValue: undefined}}, "local");
    await flushMacrotask();
    read.resolve({theme: "dark", count: 2});
    await flushMacrotask();

    expect(selection.snapshot()).toMatchObject({
        status: StorageStatus.Ready,
        value: {count: 2},
        exists: {theme: false, count: true},
    });
});

test("a new consumer retries failed reads while sharing the existing subscription", async () => {
    const provider = new Storage<State>();
    const error = new Error("read failed");
    const get = jest.spyOn(provider, "get").mockRejectedValueOnce(error).mockResolvedValue({theme: "dark"});
    const connect = jest.spyOn(provider, "subscribe");
    const observer = StorageObserver.get(provider);
    const first = observer.select(["theme"]);
    subscribe(first);
    await flushMacrotask();
    expect(first.snapshot()).toMatchObject({status: StorageStatus.Error, error, exists: {theme: undefined}});
    const second = observer.select(["theme"]);
    subscribe(second);
    await flushMacrotask();

    expect(first.snapshot()).toMatchObject({
        status: StorageStatus.Ready,
        error: undefined,
        value: {theme: "dark"},
    });

    expect(second.snapshot().value).toEqual({theme: "dark"});
    expect(get).toHaveBeenCalledTimes(2);
    expect(connect).toHaveBeenCalledTimes(1);
});

test("reconnects after subscription failure and ignores a read from the failed connection", async () => {
    const provider = new Storage<State>();
    const stale = deferred<Partial<State>>();
    const get = jest.spyOn(provider, "get").mockReturnValueOnce(stale.promise).mockResolvedValue({theme: "fresh"});
    const original = provider.subscribe.bind(provider);
    let options: StorageSubscribeOptions | undefined;

    const connect = jest.spyOn(provider, "subscribe").mockImplementation((listener, subscriptionOptions) => {
        options = subscriptionOptions;

        return original(listener, subscriptionOptions);
    });

    const observer = StorageObserver.get(provider);
    const first = observer.select(["theme"]);
    subscribe(first);
    await flushMacrotask();
    const error = new Error("subscription failed");
    options?.onError?.(error);
    expect(first.snapshot()).toMatchObject({status: StorageStatus.Error, error});
    const second = observer.select(["theme"]);
    subscribe(second);
    await flushMacrotask();

    expect(first.snapshot()).toMatchObject({
        status: StorageStatus.Ready,
        error: undefined,
        value: {theme: "fresh"},
    });

    stale.resolve({theme: "stale"});
    await flushMacrotask();
    expect(first.snapshot().value).toEqual({theme: "fresh"});
    expect(second.snapshot().value).toEqual({theme: "fresh"});
    expect(get).toHaveBeenCalledTimes(2);
    expect(connect).toHaveBeenCalledTimes(2);
});

test("a mutation recovers a failed subscription and reads every retained key without overwriting newer events", async () => {
    const provider = new Storage<State>();
    await provider.set({theme: "light", count: 1});
    const get = jest.spyOn(provider, "get");
    const original = provider.subscribe.bind(provider);
    let options: StorageSubscribeOptions | undefined;

    const connect = jest.spyOn(provider, "subscribe").mockImplementation((listener, subscriptionOptions) => {
        options = subscriptionOptions;

        return original(listener, subscriptionOptions);
    });

    const observer = StorageObserver.get(provider);
    const selection = observer.select(["theme", "count"]);
    const other = observer.select(["count"]);
    subscribe(selection);
    subscribe(other);
    await waitFor(() => expect(selection.snapshot().status).toBe(StorageStatus.Ready));
    expect(get).toHaveBeenCalledTimes(1);
    const failure = new Error("subscription closed");
    options?.onError?.(failure);
    expect(selection.snapshot()).toMatchObject({status: StorageStatus.Error, error: failure});
    expect(browser.storage.onChanged.listenerCount()).toBe(0);

    // This change is missed during the disconnection and is outside the mutation's keys.
    await provider.set("count", 2);
    const recovery = deferred<Partial<State>>();
    get.mockReturnValueOnce(recovery.promise);

    try {
        await observer.mutate(["theme"], storage => storage.set("theme", "dark"));
        expect(browser.storage.local.data).toEqual({theme: "dark", count: 2});
        expect(connect).toHaveBeenCalledTimes(2);
        expect(browser.storage.onChanged.listenerCount()).toBe(1);
        await waitFor(() => expect(selection.snapshot().value.theme).toBe("dark"));
        expect(get).toHaveBeenCalledTimes(2);
        expect(get).toHaveBeenLastCalledWith(["theme", "count"]);

        recovery.resolve({theme: "light", count: 2});

        await waitFor(() => expect(selection.snapshot()).toMatchObject({
            status: StorageStatus.Ready,
            value: {theme: "dark", count: 2},
            error: undefined,
            mutationError: undefined,
            isMutating: false,
        }));

        expect(other.snapshot()).toMatchObject({status: StorageStatus.Ready, value: {count: 2}, error: undefined});
        await observer.mutate(["theme"], storage => storage.set("theme", "blue"));
        await waitFor(() => expect(selection.snapshot().value.theme).toBe("blue"));
        expect(get).toHaveBeenCalledTimes(2);
        expect(connect).toHaveBeenCalledTimes(2);
    } finally {
        recovery.resolve({theme: "light", count: 2});
    }
});

test("a persistent subscription failure gets one retry per mutation without changing the write result", async () => {
    const provider = new Storage<State>();
    const failure = new Error("cannot subscribe");

    const connect = jest.spyOn(provider, "subscribe").mockImplementation(() => {
        throw failure;
    });

    const get = jest.spyOn(provider, "get");
    const observer = StorageObserver.get(provider);
    const selection = observer.select(["theme"]);
    subscribe(selection);
    expect(connect).toHaveBeenCalledTimes(1);

    await expect(observer.mutate(["theme"], storage => storage.set("theme", "dark"))).resolves.toBeUndefined();

    expect(browser.storage.local.data.theme).toBe("dark");
    expect(connect).toHaveBeenCalledTimes(2);
    expect(get).not.toHaveBeenCalled();

    expect(selection.snapshot()).toMatchObject({
        status: StorageStatus.Error,
        error: failure,
        mutationError: undefined,
        isMutating: false,
    });
});

test("shares mutation state and reconciles a failed operation without replacing its error", async () => {
    const provider = new Storage<State>();
    const get = jest.spyOn(provider, "get");
    const observer = StorageObserver.get(provider);
    const first = observer.select(["theme"]);
    const second = observer.select(["theme"]);
    subscribe(first);
    subscribe(second);
    await flushMacrotask();
    const error = new Error("operation failed after a write");

    const mutation = observer.mutate(["theme"], async storage => {
        await storage.set("theme", "dark");
        throw error;
    });

    expect(first.snapshot().isMutating).toBe(true);
    expect(second.snapshot().isMutating).toBe(true);
    await expect(mutation).rejects.toBe(error);

    expect(first.snapshot()).toMatchObject({
        status: StorageStatus.Ready,
        value: {theme: "dark"},
        isMutating: false,
        error: undefined,
        mutationError: error,
    });

    expect(second.snapshot().mutationError).toBe(error);
    expect(get).toHaveBeenCalledTimes(2);
    await observer.mutate(["theme"], storage => storage.remove("theme"));

    await waitFor(() => expect(first.snapshot().exists.theme).toBe(false));

    expect(first.snapshot()).toMatchObject({
        status: StorageStatus.Ready,
        value: {},
        exists: {theme: false},
        isMutating: false,
        mutationError: undefined,
    });
});

test.each(["plain", "secure", "mono", "secure-mono"])(
    "%s mutations update shared snapshots through events without reconciliation reads", async kind => {
        const provider = kind === "secure" ? SecureStorage.Local<State>({namespace: kind})
            : kind === "secure-mono" ? SecureStorage.Local<State>({namespace: kind, key: "bucket"})
                : Storage.Local<State>({namespace: kind, ...(kind === "mono" ? {key: "bucket"} : {})});

        const get = jest.spyOn(provider, "get");
        const observer = StorageObserver.get(provider);
        const keys = ["theme", "count"] as const;
        const first = observer.select(keys);
        const second = observer.select(keys);
        subscribe(first);
        subscribe(second);
        await waitFor(() => expect(first.snapshot().status).toBe(StorageStatus.Ready));
        expect(get).toHaveBeenCalledTimes(1);

        await observer.mutate(keys, storage => storage.set({theme: "dark", count: 1}));
        await waitFor(() => expect(first.snapshot().value).toEqual({theme: "dark", count: 1}));
        expect(second.snapshot().value).toEqual(first.snapshot().value);
        expect(get).toHaveBeenCalledTimes(1);

        const updated = await observer.mutate(keys, storage =>
            storage.update(keys, previous => ({count: previous.count! + 1}))
        );

        expect(updated).toEqual({theme: "dark", count: 2});
        await waitFor(() => expect(first.snapshot().value).toEqual(updated));
        expect(second.snapshot().value).toEqual(updated);
        expect(get).toHaveBeenCalledTimes(1);

        // A no-op update emits no event and must still finish the mutation.
        await expect(observer.mutate(keys, storage => storage.update(keys, () => ({})))).resolves.toEqual(updated);
        expect(first.snapshot().isMutating).toBe(false);
        expect(first.snapshot().value).toEqual(updated);
        expect(get).toHaveBeenCalledTimes(1);

        await observer.mutate(keys, storage => storage.remove([...keys]));
        await waitFor(() => expect(first.snapshot().exists).toEqual({theme: false, count: false}));
        expect(second.snapshot().value).toEqual({});
        expect(first.snapshot().isMutating).toBe(false);
        expect(get).toHaveBeenCalledTimes(1);
    }
);

test("a successful mutation can finish before its subscription delivers the confirmed value", async () => {
    const provider = new Storage<State>();
    await provider.set("theme", "light");
    const delivery = deferred();
    const connect = provider.subscribe.bind(provider);

    jest.spyOn(provider, "subscribe").mockImplementation((callback, options) => connect(async changes => {
        await delivery.promise;
        callback(changes);
    }, options));

    const get = jest.spyOn(provider, "get");
    const observer = StorageObserver.get(provider);
    const selection = observer.select(["theme"]);
    subscribe(selection);
    await waitFor(() => expect(selection.snapshot().value).toEqual({theme: "light"}));

    try {
        await observer.mutate(["theme"], storage => storage.set("theme", "dark"));

        expect(selection.snapshot()).toMatchObject({
            status: StorageStatus.Ready,
            value: {theme: "light"},
            isMutating: false,
            mutationError: undefined,
        });

        expect(browser.storage.local.data.theme).toBe("dark");
        expect(get).toHaveBeenCalledTimes(1);
        delivery.resolve();
        await waitFor(() => expect(selection.snapshot().value).toEqual({theme: "dark"}));
        expect(get).toHaveBeenCalledTimes(1);
    } finally {
        delivery.resolve();
    }
});

test("reconciliation read failures preserve the original mutation error and confirmed data", async () => {
    const provider = new Storage<State>();
    await provider.set("theme", "light");
    const observer = StorageObserver.get(provider);
    const selection = observer.select(["theme"]);
    subscribe(selection);
    await waitFor(() => expect(selection.snapshot().value).toEqual({theme: "light"}));
    const writeError = new Error("write failed");
    const readError = new Error("recovery read failed");
    jest.spyOn(provider, "set").mockRejectedValueOnce(writeError);
    browser.storage.local.get.failNext(readError);

    await expect(observer.mutate(["theme"], storage => storage.set("theme", "dark"))).rejects.toBe(writeError);

    expect(selection.snapshot()).toMatchObject({
        status: StorageStatus.Error,
        value: {theme: "light"},
        exists: {theme: true},
        error: readError,
        mutationError: writeError,
        isMutating: false,
    });

    expect(selection.snapshot().mutationError).toBe(writeError);
    await observer.refresh(["theme"]);
    expect(selection.snapshot().status).toBe(StorageStatus.Ready);
    expect(selection.snapshot().error).toBeUndefined();
});
