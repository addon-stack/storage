import {captureUnhandledErrors, flushMacrotask} from "@tests/support/async";
import {browser} from "@tests/support/browser";
import {StorageCorruptionError} from "~/errors";
import MonoStorage from "~/providers/MonoStorage";
import Storage from "~/providers/Storage";

interface BucketState {
    a?: number;
    b?: {x: number} | number | string;
    c?: string;
}

const key = "bucket" as const;

let base: Storage<Record<typeof key, Partial<BucketState>>>;

beforeEach(() => {
    base = new Storage();
});

describe("watch and subscribe", () => {
    test("subscribe emits one change map for one physical bucket event", async () => {
        const underlying = new Storage<Record<typeof key, Partial<BucketState>>>();
        const mono = new MonoStorage<BucketState, typeof key>(key, underlying);
        const callback = jest.fn();
        await chrome.storage.local.set({[key]: {a: 1, b: {x: 1}}});
        const unsubscribe = mono.subscribe(callback);

        await chrome.storage["local"].set({[key]: {a: 2, b: {x: 1}, c: "created"}});

        await flushMacrotask();

        expect(callback).toHaveBeenCalledTimes(1);

        expect(callback).toHaveBeenCalledWith({
            a: {oldValue: 1, newValue: 2},
            c: {oldValue: undefined, newValue: "created"},
        });

        unsubscribe();
    });

    test("global callback is called per changed inner key and provides the key", async () => {
        const mono = new MonoStorage<BucketState, typeof key>(key, base);
        const cb = jest.fn();
        await chrome.storage.local.set({[key]: {a: 1}});
        mono.watch(cb);

        await chrome.storage["local"].set({[key]: {a: 2, c: "x"}});

        await flushMacrotask();

        expect(cb).toHaveBeenCalledWith(2, 1, "a");
        expect(cb).toHaveBeenCalledWith("x", undefined, "c");
    });

    test("keyed callbacks fan-out only on changed keys", async () => {
        const mono = new MonoStorage<BucketState, typeof key>(key, base);
        const cbA = jest.fn();
        const cbB = jest.fn();
        const cbC = jest.fn();
        await chrome.storage.local.set({[key]: {a: 1, b: 2}});
        mono.watch({a: cbA, b: cbB, c: cbC});

        await chrome.storage["local"].set({[key]: {a: 3, b: 2, c: "x"}});

        await flushMacrotask();

        expect(cbA).toHaveBeenCalledWith(3, 1); // changed
        expect(cbB).not.toHaveBeenCalled(); // unchanged
        expect(cbC).toHaveBeenCalledWith("x", undefined); // added
    });

    test("shallowEqual prevents notifications for equal objects", async () => {
        const mono = new MonoStorage<BucketState, typeof key>(key, base);
        const cbB = jest.fn();
        mono.watch({b: cbB});

        browser.storage.onChanged.emit({[key]: {oldValue: {b: {x: 1}}, newValue: {b: {x: 1}}}}, "local");

        await flushMacrotask();

        expect(cbB).not.toHaveBeenCalled();
    });

    test("subscriber rejection is uncaught without disposing the Mono subscription", async () => {
        const mono = new MonoStorage<BucketState, typeof key>(key, base);
        const errors = captureUnhandledErrors();
        const callback = jest.fn().mockRejectedValueOnce(new Error("subscriber failed")).mockResolvedValue(undefined);
        const unsubscribe = mono.subscribe(callback);

        try {
            browser.storage.onChanged.emit({[key]: {oldValue: {a: 1}, newValue: {a: 2}}}, "local");
            await flushMacrotask();

            expect(callback).toHaveBeenCalledTimes(1);
            expect(errors.pending).toBe(1);
            expect(() => errors.runNext()).toThrow("subscriber failed");

            browser.storage.onChanged.emit({[key]: {oldValue: {a: 2}, newValue: {a: 3}}}, "local");
            await flushMacrotask();
            expect(callback).toHaveBeenCalledTimes(2);
        } finally {
            unsubscribe();
            errors.restore();
        }
    });

    test("a corrupted bucket terminates the Mono subscription", async () => {
        const mono = new MonoStorage<BucketState, typeof key>(key, base);
        const errors = captureUnhandledErrors();
        const callback = jest.fn();
        mono.subscribe(callback);

        try {
            browser.storage.onChanged.emit({[key]: {oldValue: {a: 1}, newValue: []}}, "local");
            await flushMacrotask();

            expect(callback).not.toHaveBeenCalled();
            expect(errors.pending).toBe(1);
            expect(() => errors.runNext()).toThrow(StorageCorruptionError);

            browser.storage.onChanged.emit({[key]: {oldValue: {a: 1}, newValue: {a: 2}}}, "local");
            await flushMacrotask();
            expect(callback).not.toHaveBeenCalled();
        } finally {
            errors.restore();
        }
    });
});
