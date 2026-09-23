import {StorageObserver, type StorageObserverScope} from "./index";

import {flushMacrotask} from "../../tests/helpers/async";
import {StorageStatus} from "../index";
import Storage from "../providers/Storage";

import type {StorageSubscribeOptions} from "../types";

// These tests must work without loading a frontend runtime, directly or transitively.
jest.mock("react", () => {
    throw new Error("StorageObserver must not depend on React");
});

jest.mock("react-dom", () => {
    throw new Error("StorageObserver must not depend on React DOM");
});

type State = {theme: string | null; count: number};

const deferred = <T>() => {
    let resolve!: (value: T) => void;

    const promise = new Promise<T>(yes => {
        resolve = yes;
    });

    return {promise, resolve};
};

const releases: (() => void)[] = [];

const subscribe = (selection: StorageObserverScope, listener = jest.fn()) => {
    const release = selection.subscribe(listener);
    releases.push(release);

    return release;
};

beforeEach(async () => {
    await chrome.storage.local.clear();
    global.resetStorageChangeListeners();
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
    global.simulateStorageChange({storage: provider, key: "theme", oldValue: null, newValue: null});
    await flushMacrotask();
    expect(first.snapshot()).toBe(snapshot);
    expect(listener).not.toHaveBeenCalled();
    global.simulateStorageChange({storage: provider, key: "theme", oldValue: null, newValue: "dark"});
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
    expect(chrome.storage.onChanged.removeListener).not.toHaveBeenCalled();
    lastRelease();
    lastRelease();
    await flushMacrotask();
    expect(chrome.storage.onChanged.removeListener).toHaveBeenCalledTimes(1);

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
    global.simulateStorageChange({storage: provider, key: "theme", oldValue: "dark", newValue: undefined});
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

test("shares mutation state and reconciles a failed operation without replacing its error", async () => {
    const provider = new Storage<State>();
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
    await observer.mutate(["theme"], storage => storage.remove("theme"));

    expect(first.snapshot()).toMatchObject({
        status: StorageStatus.Ready,
        value: {},
        exists: {theme: false},
        isMutating: false,
        mutationError: undefined,
    });
});
