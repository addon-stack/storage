import {captureUnhandledErrors, flushMacrotask, waitFor} from "@tests/support/async";
import {browser} from "@tests/support/browser";
import {StorageCorruptionError} from "~/errors";
import {MonoStorage, SecureStorage, Storage} from "~/providers/index";

test("secure subscription reports a terminal decoding failure once without partial delivery", async () => {
    const storage = new SecureStorage<{theme: string}>();
    const onError = jest.fn();
    const callback = jest.fn();
    const errors = captureUnhandledErrors();
    const stop = storage.subscribe(callback, {onError});

    try {
        browser.storage.onChanged.emit({"secure::theme": {oldValue: undefined, newValue: 42}}, "local");
        await flushMacrotask();
        await waitFor(() => expect(onError).toHaveBeenCalledTimes(1));
        expect(onError).toHaveBeenCalledWith(expect.any(StorageCorruptionError));
        expect(errors.pending).toBe(0);
        await storage.set({theme: "dark"});
        expect(callback).not.toHaveBeenCalled();
        await waitFor(() => expect(onError).toHaveBeenCalledTimes(1));
    } finally {
        stop();
        errors.restore();
    }
});

test.each([false, true])("MonoStorage forwards terminal %s base/bucket errors to watch onError", async secure => {
    const base = secure ? new SecureStorage<{bucket: {theme: string}}>() : new Storage<{bucket: {theme: string}}>();
    const mono = new MonoStorage<{theme: string}, "bucket">("bucket", base);
    const onError = jest.fn();
    const callback = jest.fn();
    const errors = captureUnhandledErrors();
    const stop = mono.watch({theme: callback}, {onError});

    try {
        browser.storage.onChanged.emit({[(secure ? "secure::" : "") + "bucket"]: {
            oldValue: undefined,
            newValue: 42,
        }}, "local");

        await flushMacrotask();
        await waitFor(() => expect(onError).toHaveBeenCalledTimes(1));
        expect(onError).toHaveBeenCalledWith(expect.any(StorageCorruptionError));
        expect(callback).not.toHaveBeenCalled();
        expect(errors.pending).toBe(0);
    } finally {
        stop();
        errors.restore();
    }
});

test("onError does not intercept application callback failures or close their subscriptions", async () => {
    const storage = new Storage<{count: number}>();
    const onError = jest.fn();

    const callback = jest.fn(() => {
        throw new Error("application failure");
    });

    const errors = captureUnhandledErrors();
    const stop = storage.subscribe(callback, {onError});

    try {
        browser.storage.onChanged.emit({count: {oldValue: 0, newValue: 1}}, "local");
        await flushMacrotask();
        expect(onError).not.toHaveBeenCalled();
        expect(() => errors.runNext()).toThrow("application failure");
        browser.storage.onChanged.emit({count: {oldValue: 1, newValue: 2}}, "local");
        await flushMacrotask();
        expect(callback).toHaveBeenCalledTimes(2);
        expect(() => errors.runNext()).toThrow("application failure");
    } finally {
        stop();
        errors.restore();
    }
});

test("an error handler rejection is surfaced without delivering future events", async () => {
    const storage = new SecureStorage<{theme: string}>();
    const handlerError = new Error("handler failed");

    const onError = jest.fn(async () => {
        throw handlerError;
    });

    const errors = captureUnhandledErrors();
    const stop = storage.subscribe(jest.fn(), {onError});

    try {
        browser.storage.onChanged.emit({"secure::theme": {oldValue: undefined, newValue: 42}}, "local");
        await flushMacrotask();
        expect(() => errors.runNext()).toThrow(handlerError);
        browser.storage.onChanged.emit({"secure::theme": {oldValue: undefined, newValue: 43}}, "local");
        await flushMacrotask();
        await waitFor(() => expect(onError).toHaveBeenCalledTimes(1));
    } finally {
        stop();
        errors.restore();
    }
});
