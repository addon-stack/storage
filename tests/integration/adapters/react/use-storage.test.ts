import {createElement, type PropsWithChildren, StrictMode} from "react";

import {act, renderHook, waitFor} from "@testing-library/react";

import {deferred, flushMacrotask} from "@tests/support/async";
import {browser, withBrowser} from "@tests/support/browser";
import useStorage from "~/adapters/react/use-storage";
import {StoragePartialUpdateError} from "~/errors";
import {StorageStatus} from "~/index";
import {SecureStorage, Storage} from "~/providers";

import type {StorageSubscribeOptions} from "~/types";

type State = {theme: string | null; language: string; count: number; extra: string};

const ready = async (result: {current: {status: StorageStatus}}) =>
    waitFor(() => expect(result.current.status).toBe(StorageStatus.Ready));

beforeEach(async () => {
    await chrome.storage.local.clear();
    jest.clearAllMocks();
});

afterEach(async () => {
    await flushMacrotask();
    jest.restoreAllMocks();
});

test("renders a default immediately, then distinguishes an absent key without persisting the default", async () => {
    const storage = new Storage<State>();
    const read = deferred<Partial<State>>();
    jest.spyOn(storage, "get").mockReturnValueOnce(read.promise);
    const set = jest.spyOn(storage, "set");
    const {result} = renderHook(() => useStorage({storage, key: "theme", defaultValue: "light"}));

    expect(result.current).toMatchObject({
        value: "light",
        status: StorageStatus.Loading,
        exists: undefined,
    });

    await act(async () => read.resolve({}));

    expect(result.current).toMatchObject({
        value: "light",
        status: StorageStatus.Ready,
        exists: false,
    });

    expect(set).not.toHaveBeenCalled();
});

test("uses the default local provider and Promise mutations", async () => {
    const {result} = renderHook(() => useStorage({key: "theme", defaultValue: "light"}));
    await ready(result);

    await act(async () => {
        await result.current.set("dark");
    });

    expect(result.current.value).toBe("dark");
    expect(result.current.exists).toBe(true);

    await act(async () => {
        await result.current.remove();
    });

    expect(result.current.value).toBe("light");
    expect(result.current.exists).toBe(false);
});

test("preserves null and distinguishes a stored value equal to the default", async () => {
    const storage = new Storage<State>();
    await storage.set({theme: null, language: "ru"});

    const {result} = renderHook(() => useStorage({
        storage,
        keys: ["theme", "language", "count"],
        defaultValue: {theme: "light", language: "ru"},
    }));

    await ready(result);
    expect(result.current.value).toEqual({theme: null, language: "ru"});
    expect(result.current.exists).toEqual({theme: true, language: true, count: false});
});

test("keeps keys mode as an object even for one key and supports an empty selection", async () => {
    const storage = new Storage<State>();
    const {result} = renderHook(() => useStorage({storage, keys: ["theme"], defaultValue: {theme: "light"}}));
    await ready(result);
    expect(result.current.value).toEqual({theme: "light"});
    const empty = renderHook(() => useStorage({storage, keys: []}));
    expect(empty.result.current).toMatchObject({value: {}, exists: {}, status: StorageStatus.Ready});
});

test("shares one subscription and in-flight read across consumers, with independent defaults", async () => {
    const storage = new Storage<State>();
    const read = deferred<Partial<State>>();
    const get = jest.spyOn(storage, "get").mockReturnValue(read.promise);
    const subscribe = jest.spyOn(storage, "subscribe");
    const first = renderHook(() => useStorage({storage, key: "theme", defaultValue: "light"}));
    const second = renderHook(() => useStorage({storage, keys: ["theme"], defaultValue: {theme: "dark"}}));
    await act(async () => read.resolve({}));
    expect(get).toHaveBeenCalledTimes(1);
    expect(subscribe).toHaveBeenCalledTimes(1);
    expect(first.result.current.value).toBe("light");
    expect(second.result.current.value).toEqual({theme: "dark"});
    await act(() => browser.storage.onChanged.emit({theme: {oldValue: undefined, newValue: "blue"}}, "local"));
    await waitFor(() => expect(first.result.current.value).toBe("blue"));
    expect(second.result.current.value).toEqual({theme: "blue"});
});

test("does not re-read or resubscribe for inline options and reordered equivalent keys", async () => {
    const storage = new Storage<State>();
    const get = jest.spyOn(storage, "get");
    const subscribe = jest.spyOn(storage, "subscribe");

    const {result, rerender} = renderHook(({reverse}) => useStorage({
        storage,
        keys: reverse ? ["language", "theme"] : ["theme", "language"],
        defaultValue: {theme: "light"},
    }), {initialProps: {reverse: false}});

    await ready(result);
    const set = result.current.set;
    rerender({reverse: true});
    expect(get).toHaveBeenCalledTimes(1);
    expect(subscribe).toHaveBeenCalledTimes(1);
    expect(result.current.set).toBe(set);
});

test("keeps snapshot identity and avoids renders when events or refresh return equal data", async () => {
    const storage = new Storage<{settings: {theme: string}}>();
    await storage.set("settings", {theme: "dark"});
    const render = jest.fn(() => useStorage({storage, keys: ["settings"]}));
    const {result} = renderHook(render);
    await ready(result);
    const count = render.mock.calls.length;
    const value = result.current.value;

    await act(async () => {
        browser.storage.onChanged.emit({settings: {oldValue: {theme: "dark"}, newValue: {theme: "dark"}}}, "local");
        await flushMacrotask();
        await result.current.refresh();
    });

    expect(render).toHaveBeenCalledTimes(count);
    expect(result.current.value).toBe(value);
});

test("ignores an old key's read after switching selection", async () => {
    const storage = new Storage<State>();
    const old = deferred<Partial<State>>();
    jest.spyOn(storage, "get").mockReturnValueOnce(old.promise).mockResolvedValue({language: "en"});

    const {result, rerender} = renderHook(({key}: {key: "theme" | "language"}) => useStorage({
        storage,
        key,
        defaultValue: "fallback",
    }), {initialProps: {key: "theme"}});

    await act(async () => {
        await Promise.resolve();
    });

    rerender({key: "language"});
    expect(result.current.value).toBe("fallback");
    await ready(result);
    await act(async () => old.resolve({theme: "old"}));
    expect(result.current.value).toBe("en");
});

test("switches providers and isolates identical keys by provider identity", async () => {
    const a = new Storage<State>({namespace: "a"});
    const b = new Storage<State>({namespace: "b"});
    const pending = deferred<Partial<State>>();
    jest.spyOn(a, "get").mockReturnValue(pending.promise);
    await b.set("theme", "b");

    const {result, rerender} = renderHook(({storage}) => useStorage({
        storage,
        key: "theme",
    }), {initialProps: {storage: a}});

    rerender({storage: b});
    await ready(result);
    await act(async () => pending.resolve({theme: "a"}));
    expect(result.current.value).toBe("b");
});

test("a storage event wins over an older initial read, including deletion", async () => {
    const storage = new Storage<State>();
    const read = deferred<Partial<State>>();
    jest.spyOn(storage, "get").mockReturnValueOnce(read.promise);

    const {result} = renderHook(() => useStorage({
        storage,
        keys: ["theme", "language"],
        defaultValue: {theme: "fallback"},
    }));

    await act(() => browser.storage.onChanged.emit({theme: {oldValue: "old", newValue: undefined}}, "local"));

    await act(async () => {
        await flushMacrotask();
    });

    await act(async () => read.resolve({theme: "old", language: "en"}));
    expect(result.current.value).toEqual({theme: "fallback", language: "en"});
    expect(result.current.exists).toEqual({theme: false, language: true});
});

test("read failures are observable, and refresh retries without writing defaults", async () => {
    const storage = new Storage<State>();
    const error = new Error("read failed");
    jest.spyOn(storage, "get").mockRejectedValueOnce(error);
    const {result} = renderHook(() => useStorage({storage, key: "theme", defaultValue: "light"}));
    await waitFor(() => expect(result.current.status).toBe(StorageStatus.Error));
    expect(result.current.error).toBe(error);
    expect(result.current.exists).toBeUndefined();

    await act(async () => {
        await result.current.refresh();
    });

    expect(result.current).toMatchObject({status: StorageStatus.Ready, value: "light", exists: false, error: undefined});
});

test("subscription failures retain values and refresh reinstalls the subscription", async () => {
    const storage = new Storage<State>();
    await storage.set("theme", "dark");
    const original = storage.subscribe.bind(storage);
    let subscriptionOptions: StorageSubscribeOptions | undefined;

    const subscribe = jest.spyOn(storage, "subscribe").mockImplementation((callback, options) => {
        subscriptionOptions = options;

        return original(callback, options);
    });

    const {result} = renderHook(() => useStorage({storage, key: "theme"}));
    await ready(result);
    const error = new Error("subscription closed");

    act(() => {
        subscriptionOptions?.onError?.(error);
    });

    expect(result.current).toMatchObject({status: StorageStatus.Error, value: "dark", exists: true, error});

    await act(async () => {
        await result.current.refresh();
    });

    expect(subscribe).toHaveBeenCalledTimes(2);
    expect(result.current.status).toBe(StorageStatus.Ready);
});

test("batch writes are patches, updates receive stored data, and remove only affects selected keys", async () => {
    const storage = new Storage<State>();
    await storage.set({language: "en", extra: "keep"});

    const {result} = renderHook(() => useStorage({
        storage,
        keys: ["theme", "language"],
        defaultValue: {theme: "default"},
    }));

    await ready(result);

    const updater = jest.fn((previous: Partial<Pick<State, "theme" | "language">>) => {
        expect(previous).toEqual({language: "en"});

        return {theme: "dark"};
    });

    await act(async () => {
        await result.current.update(updater, {timeout: 100});
    });

    expect(updater).toHaveBeenCalledTimes(1);
    expect(result.current.value).toEqual({theme: "dark", language: "en"});

    await act(async () => {
        await result.current.set({theme: "light"});
    });

    expect(await storage.get("language")).toBe("en");

    await act(async () => {
        await result.current.remove();
    });

    expect(result.current.value).toEqual({theme: "default"});
    expect(await storage.get("extra")).toBe("keep");
});

test("concurrent functional updates use the provider lock and forward lock options", async () => {
    const storage = new Storage<State>();
    const update = jest.spyOn(storage, "update");
    const {result} = renderHook(() => useStorage({storage, key: "count", defaultValue: 100}));
    await ready(result);
    const options = {timeout: 500, signal: new AbortController().signal};

    await act(async () => {
        await Promise.all([result.current.update(previous => (previous ?? 0) + 1, options), result.current.update(previous => (previous ?? 0) + 1)]);
    });

    expect(result.current.value).toBe(2);
    expect(update).toHaveBeenCalledWith("count", expect.any(Function), options);
});

test("a failed earlier write cannot roll back a later success, and isMutating tracks all operations", async () => {
    const storage = new Storage<State>();
    await storage.set("theme", "initial");
    const first = deferred<void>();
    jest.spyOn(storage, "set").mockReturnValueOnce(first.promise);
    const {result} = renderHook(() => useStorage({storage, key: "theme"}));
    await ready(result);
    let failed!: Promise<unknown>;

    act(() => {
        failed = result.current.set("first").catch(error => error);
    });

    expect(result.current.isMutating).toBe(true);
    expect(result.current.value).toBe("initial");

    await act(async () => {
        await result.current.set("second");
    });

    expect(result.current.value).toBe("second");
    expect(result.current.isMutating).toBe(true);
    const error = new Error("first failed");

    await act(async () => {
        first.reject(error); expect(await failed).toBe(error);
    });

    expect(result.current).toMatchObject({
        value: "second",
        isMutating: false,
        mutationError: undefined,
        status: StorageStatus.Ready,
    });
});

test("mutation errors reject, retain confirmed data and recover partial writes", async () => {
    const storage = new Storage<State>();
    await storage.set({theme: "old", language: "en"});
    const failure = new Error("remove failed");
    browser.storage.local.remove.failNext(failure);

    const {result} = renderHook(() => useStorage({storage, keys: ["theme", "language"]}));
    await ready(result);

    await act(async () => {
        await expect(result.current.update(() => ({theme: "new", language: undefined}))).rejects.toMatchObject({
            appliedSetKeys: ["theme"], attemptedRemoveKeys: ["language"], cause: failure,
        });
    });

    expect(result.current).toMatchObject({
        value: {theme: "new", language: "en"},
        status: StorageStatus.Ready,
        mutationError: expect.any(StoragePartialUpdateError),
        isMutating: false,
    });
});

test("rejects unselected batch writes at runtime", async () => {
    const storage = new Storage<State>();
    const {result} = renderHook(() => useStorage({storage, keys: ["theme"]}));
    await ready(result);
    const set = jest.spyOn(storage, "set");

    await act(async () => {
        await expect(result.current.set({extra: "bad"} as any)).rejects.toThrow("unselected key");
    });

    expect(set).not.toHaveBeenCalled();
});

test.each(["plain", "secure", "mono", "secure-mono"])("works through %s providers", async kind => {
    const storage = kind === "secure" ? SecureStorage.Local<State>({namespace: kind})
        : kind === "secure-mono" ? SecureStorage.Local<State>({namespace: kind, key: "bucket"})
            : Storage.Local<State>({namespace: kind, ...(kind === "mono" ? {key: "bucket"} : {})});

    const {result} = renderHook(() => useStorage({storage, keys: ["theme", "count"]}));
    await ready(result);

    await act(async () => {
        await result.current.set({theme: "dark", count: 1});
    });

    await waitFor(() => expect(result.current.value).toEqual({theme: "dark", count: 1}));

    await act(async () => {
        await result.current.update(previous => ({count: (previous.count ?? 0) + 1}));
    });

    await waitFor(() => expect(result.current.value).toEqual({theme: "dark", count: 2}));

    await act(async () => {
        await result.current.remove();
    });

    await waitFor(() => expect(result.current.exists).toEqual({theme: false, count: false}));
});

test("StrictMode shares setup work and unmount releases listeners with pending reads", async () => {
    const storage = new Storage<State>();
    const read = deferred<Partial<State>>();
    const get = jest.spyOn(storage, "get").mockReturnValue(read.promise);
    const subscribe = jest.spyOn(storage, "subscribe");
    const removeListener = jest.spyOn(chrome.storage.onChanged, "removeListener");
    const wrapper = ({children}: PropsWithChildren) => createElement(StrictMode, null, children);
    const {unmount} = renderHook(() => useStorage({storage, key: "theme"}), {wrapper});

    await act(async () => {
        await Promise.resolve();
    });

    expect(get).toHaveBeenCalledTimes(1);
    expect(subscribe).toHaveBeenCalledTimes(1);
    unmount();
    await flushMacrotask();
    expect(removeListener).toHaveBeenCalledTimes(1);
    await act(async () => read.resolve({theme: "late"}));
});

test("a later refresh wins over an older refresh", async () => {
    const storage = new Storage<State>();
    const {result} = renderHook(() => useStorage({storage, key: "theme"}));
    await ready(result);
    const old = deferred<Partial<State>>();
    jest.spyOn(storage, "get").mockReturnValueOnce(old.promise).mockResolvedValueOnce({theme: "new"});
    let earlier!: Promise<void>;

    act(() => {
        earlier = result.current.refresh();
    });

    await act(async () => {
        await Promise.resolve();
    });

    await act(async () => {
        await result.current.refresh();
    });

    await act(async () => {
        old.resolve({theme: "old"}); await earlier;
    });

    expect(result.current.value).toBe("new");
});

test("read-only managed data can be observed and native mutation errors are preserved", async () => {
    await withBrowser({storage: {managed: {theme: "policy"}}}, async () => {
        const storage = Storage.Managed<State>();
        const {result, unmount} = renderHook(() => useStorage({storage, key: "theme"}));

        try {
            await ready(result);

            await act(async () => {
                await expect(result.current.set("other")).rejects.toThrow("managed storage is read-only");
            });

            expect(result.current).toMatchObject({value: "policy", exists: true, status: StorageStatus.Ready});
            expect(result.current.mutationError).toEqual(expect.objectContaining({message: expect.stringContaining("managed storage is read-only")}));
        } finally {
            unmount();
            await Promise.resolve();
        }
    });
});

test("a secure decoding failure reaches the hook and refresh recovers the subscription", async () => {
    const storage = new SecureStorage<State>();
    const {result} = renderHook(() => useStorage({storage, key: "theme", defaultValue: "light"}));
    await ready(result);
    await act(() => browser.storage.onChanged.emit({"secure::theme": {oldValue: undefined, newValue: 42}}, "local"));
    await waitFor(() => expect(result.current.status).toBe(StorageStatus.Error));
    expect(result.current.error).toBeInstanceOf(Error);

    await act(async () => {
        await result.current.refresh();
    });

    expect(result.current.status).toBe(StorageStatus.Ready);

    await act(async () => {
        await storage.set({theme: "dark"});
    });

    await waitFor(() => expect(result.current.value).toBe("dark"));
});

test("new consumers retry a failed subscription and recover existing consumers", async () => {
    const storage = new Storage<State>();
    const error = new Error("cannot subscribe");

    jest.spyOn(storage, "subscribe").mockImplementationOnce(() => {
        throw error;
    });

    const first = renderHook(() => useStorage({storage, key: "theme"}));
    await waitFor(() => expect(first.result.current.status).toBe(StorageStatus.Error));
    const second = renderHook(() => useStorage({storage, key: "language"}));
    await ready(second.result);
    await ready(first.result);
    expect(storage.subscribe).toHaveBeenCalledTimes(2);
});

test("new consumers re-read after the last subscriber has left", async () => {
    const storage = new Storage<State>();
    await storage.set("theme", "first");
    const first = renderHook(() => useStorage({storage, key: "theme"}));
    await ready(first.result);
    first.unmount();
    await flushMacrotask();
    await storage.set("theme", "second");
    const second = renderHook(() => useStorage({storage, key: "theme"}));
    await ready(second.result);
    expect(second.result.current.value).toBe("second");
});

test("one batch event updates the selected snapshot together and ignores unselected changes", async () => {
    const storage = new Storage<State>();
    const renders: unknown[] = [];

    const {result} = renderHook(() => {
        const state = useStorage({storage, keys: ["theme", "language"]});
        renders.push(state.value);

        return state;
    });

    await ready(result);
    renders.length = 0;
    await act(() => browser.storage.onChanged.emit({theme: {newValue: "dark"}, language: {newValue: "en"}}, "local"));
    await waitFor(() => expect(result.current.value).toEqual({theme: "dark", language: "en"}));

    expect(renders.every(value => JSON.stringify(value) === JSON.stringify({
        language: "en",
        theme: "dark",
    }))).toBe(true);

    const count = renders.length;
    await act(() => browser.storage.onChanged.emit({extra: {oldValue: undefined, newValue: "other"}}, "local"));

    await act(async () => {
        await flushMacrotask();
    });

    expect(renders).toHaveLength(count);
});

test("inline batch defaults preserve value identity across renders and readiness changes", async () => {
    const storage = new Storage<{settings: {theme: string}; count: number}>();
    const read = deferred<Partial<{settings: {theme: string}; count: number}>>();
    jest.spyOn(storage, "get").mockReturnValueOnce(read.promise);

    const {result, rerender} = renderHook(({theme}) => useStorage({
        storage, keys: ["settings", "count"], defaultValue: {settings: {theme}},
    }), {initialProps: {theme: "light"}});

    const initial = result.current.value;
    rerender({theme: "light"});
    expect(result.current.value).toBe(initial);
    await act(async () => read.resolve({}));
    expect(result.current.status).toBe(StorageStatus.Ready);
    expect(result.current.value).toBe(initial);
    rerender({theme: "dark"});
    const changed = result.current.value;
    expect(changed).not.toBe(initial);
    expect(changed).toEqual({settings: {theme: "dark"}});

    await act(async () => {
        browser.storage.onChanged.emit({settings: {oldValue: undefined, newValue: {theme: "dark"}}}, "local");
        await flushMacrotask();
    });

    expect(result.current.value).toBe(changed);
    rerender({theme: "ignored"});
    expect(result.current.value).toBe(changed);
});

test("batch projection handles removed defaults and prototype-named keys", async () => {
    const storage = new Storage<{constructor: string; toString: string; __proto__: string}>();

    const {result, rerender} = renderHook(({defaults}) => useStorage({storage,
        keys: ["constructor", "toString", "__proto__"],
        defaultValue: defaults ? {constructor: "own", toString: undefined, ["__proto__"]: "safe"} : undefined,
    }), {initialProps: {defaults: true}});

    await ready(result);
    const value = result.current.value;
    rerender({defaults: true});
    expect(result.current.value).toBe(value);
    expect(Object.keys(value)).toEqual(["__proto__", "constructor"]);
    rerender({defaults: false});
    expect(Object.keys(result.current.value)).toEqual([]);
    const empty = result.current.value;
    rerender({defaults: false});
    expect(result.current.value).toBe(empty);
});

test("invalid batch set rejects before mutation state, I/O or reconciliation", async () => {
    const storage = new Storage<State>();
    const {result} = renderHook(() => useStorage({storage, keys: ["theme"]}));
    await ready(result);
    const failure = new Error("previous write failed");
    jest.spyOn(storage, "set").mockRejectedValueOnce(failure);

    await act(async () => {
        await expect(result.current.set({theme: "dark"})).rejects.toBe(failure);
    });

    const set = jest.spyOn(storage, "set").mockClear();
    const get = jest.spyOn(storage, "get");
    const subscribe = jest.spyOn(storage, "subscribe");
    const state = result.current;

    for (const invalid of [{extra: "bad"}, null, [], "bad"]) {
        await act(async () => {
            await expect(result.current.set(invalid as any)).rejects.toBeInstanceOf(TypeError);
        });

        expect(result.current).toBe(state);
    }

    expect(result.current.mutationError).toBe(failure);
    expect(get).not.toHaveBeenCalled();
    expect(set).not.toHaveBeenCalled();
    expect(subscribe).not.toHaveBeenCalled();
});

test("new consumers retry an initial read error once and share the pending retry", async () => {
    const storage = new Storage<State>();
    const retry = deferred<Partial<State>>();
    const get = jest.spyOn(storage, "get").mockRejectedValueOnce(new Error("offline")).mockReturnValueOnce(retry.promise);
    const first = renderHook(() => useStorage({storage, key: "theme"}));
    await waitFor(() => expect(first.result.current.status).toBe(StorageStatus.Error));
    const second = renderHook(() => useStorage({storage, key: "theme"}));
    const third = renderHook(() => useStorage({storage, keys: ["theme"]}));
    expect(second.result.current.status).toBe(StorageStatus.Loading);
    await act(async () => retry.resolve({theme: "recovered"}));
    expect(get).toHaveBeenCalledTimes(2);
    expect(first.result.current.value).toBe("recovered");
    expect(second.result.current.error).toBeUndefined();
    expect(third.result.current.value).toEqual({theme: "recovered"});
});

test("retry after subscription failure ignores an obsolete pending read", async () => {
    const storage = new Storage<State>();
    const stale = deferred<Partial<State>>();
    jest.spyOn(storage, "get").mockReturnValueOnce(stale.promise).mockResolvedValueOnce({theme: "fresh"});
    const subscribe = storage.subscribe.bind(storage);
    let options: StorageSubscribeOptions | undefined;

    jest.spyOn(storage, "subscribe").mockImplementation((callback, next) => {
        options = next;

        return subscribe(callback, next);
    });

    const first = renderHook(() => useStorage({storage, key: "theme"}));

    await act(async () => {
        await Promise.resolve(); options?.onError?.(new Error("closed"));
    });

    const second = renderHook(() => useStorage({storage, key: "theme"}));
    await ready(second.result);
    await act(async () => stale.resolve({theme: "obsolete"}));
    expect(first.result.current.value).toBe("fresh");
    expect(second.result.current.value).toBe("fresh");
});

test.each([
    undefined, null, "theme", {}, {key: "theme", keys: ["theme"]},
    {key: 1}, {key: undefined}, {keys: "theme"}, {keys: ["theme", 1]},
    {key: "bad:key"}, {keys: ["bad:key"]},
])("rejects invalid runtime selection %#", options => {
    jest.spyOn(console, "error").mockImplementation(() => undefined);
    expect(() => renderHook(() => useStorage(options as any))).toThrow();
});

test.each([null, [], new Date(0), {extra: "bad"}, {theme: "light", extra: "bad"}])(
    "rejects invalid batch defaults before subscribing %#", defaultValue => {
        jest.spyOn(console, "error").mockImplementation(() => undefined);
        const storage = new Storage<State>();
        const subscribe = jest.spyOn(storage, "subscribe");
        const get = jest.spyOn(storage, "get");

        expect(() => renderHook(() => useStorage({storage, keys: ["theme"], defaultValue} as any)))
            .toThrow("useStorage defaultValue must contain only selected keys");

        expect(subscribe).not.toHaveBeenCalled();
        expect(get).not.toHaveBeenCalled();
    }
);
