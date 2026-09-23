import {StorageCorruptionError} from "../errors";
import {MonoStorage, SecureStorage, Storage} from "./index";
import {captureUnhandledErrors, flushMacrotask} from "../../tests/helpers/async";

beforeEach(() => global.resetStorageChangeListeners());

test("secure subscription reports a terminal decoding failure once without partial delivery", async () => {
    const storage = new SecureStorage<{theme: string}>();
    const onError = jest.fn();
    const callback = jest.fn();
    const errors = captureUnhandledErrors();
    const stop = storage.subscribe(callback, {onError});
    try {
        global.simulateStorageChange({storage, key: "theme", oldValue: undefined, newValue: 42});
        await flushMacrotask();
        expect(onError).toHaveBeenCalledTimes(1);
        expect(onError).toHaveBeenCalledWith(expect.any(StorageCorruptionError));
        expect(errors.pending).toBe(0);
        await global.simulateSecureStorageChange({storage, key: "theme", oldValue: undefined, newValue: "dark"});
        expect(callback).not.toHaveBeenCalled();
        expect(onError).toHaveBeenCalledTimes(1);
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
        global.simulateStorageChange({storage: base, key: "bucket", oldValue: undefined, newValue: 42});
        await flushMacrotask();
        expect(onError).toHaveBeenCalledTimes(1);
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
    const callback = jest.fn(() => { throw new Error("application failure"); });
    const errors = captureUnhandledErrors();
    const stop = storage.subscribe(callback, {onError});
    try {
        global.simulateStorageChange({storage, key: "count", oldValue: 0, newValue: 1});
        await flushMacrotask();
        expect(onError).not.toHaveBeenCalled();
        expect(() => errors.runNext()).toThrow("application failure");
        global.simulateStorageChange({storage, key: "count", oldValue: 1, newValue: 2});
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
    const onError = jest.fn(async () => { throw handlerError; });
    const errors = captureUnhandledErrors();
    const stop = storage.subscribe(jest.fn(), {onError});
    try {
        global.simulateStorageChange({storage, key: "theme", oldValue: undefined, newValue: 42});
        await flushMacrotask();
        expect(() => errors.runNext()).toThrow(handlerError);
        global.simulateStorageChange({storage, key: "theme", oldValue: undefined, newValue: 43});
        await flushMacrotask();
        expect(onError).toHaveBeenCalledTimes(1);
    } finally {
        stop();
        errors.restore();
    }
});
