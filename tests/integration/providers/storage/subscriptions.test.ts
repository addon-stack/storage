import {captureUnhandledErrors, flushMacrotask} from "@tests/support/async";
import {browser} from "@tests/support/browser";
import Storage from "~/providers/Storage";

let storage: Storage;

interface BatchState {
    a?: number;
    b?: number;
    c?: string;
    missing?: boolean;
}

beforeEach(() => {
    storage = new Storage();
});

describe("watch and subscribe methods", () => {
    test("subscribe receives one logical change map for one native multi-key event", async () => {
        const isolatedStorage = new Storage<BatchState>({namespace: "batch"});
        const batchCallback = jest.fn();
        const legacyCallback = jest.fn();
        await chrome.storage.local.set({"batch:a": 1});
        const unsubscribeBatch = isolatedStorage.subscribe(batchCallback);
        const unsubscribeLegacy = isolatedStorage.watch(legacyCallback);

        await chrome.storage["local"].set({"batch:a": 2, "batch:c": "created"});

        await flushMacrotask();

        expect(batchCallback).toHaveBeenCalledTimes(1);

        expect(batchCallback).toHaveBeenCalledWith({
            a: {oldValue: 1, newValue: 2},
            c: {oldValue: undefined, newValue: "created"},
        });

        expect(legacyCallback).toHaveBeenCalledTimes(2);
        expect(legacyCallback).toHaveBeenCalledWith(2, 1, "a");
        expect(legacyCallback).toHaveBeenCalledWith("created", undefined, "c");

        unsubscribeBatch();

        await chrome.storage["local"].set({"batch:a": 3});

        await flushMacrotask();

        expect(batchCallback).toHaveBeenCalledTimes(1);
        unsubscribeLegacy();
    });

    test("subscribe ignores events from another namespace or storage area", async () => {
        const isolatedStorage = new Storage<BatchState>({namespace: "batch"});
        const callback = jest.fn();
        const unsubscribe = isolatedStorage.subscribe(callback);

        browser.storage.onChanged.emit({"other:a": {oldValue: 1, newValue: 2}}, "local");

        browser.storage.onChanged.emit({"batch:a": {oldValue: 1, newValue: 2}}, "sync");

        await flushMacrotask();

        expect(callback).not.toHaveBeenCalled();
        unsubscribe();
    });

    test("subscribe filters deep-equal entries and skips empty change maps", async () => {
        const isolatedStorage = new Storage<BatchState>();
        const callback = jest.fn();
        const unsubscribe = isolatedStorage.subscribe(callback);

        browser.storage.onChanged.emit({
            a: {oldValue: 1, newValue: 1},
            b: {oldValue: 2, newValue: 3},
        }, "local");

        await flushMacrotask();

        expect(callback).toHaveBeenCalledTimes(1);
        expect(callback).toHaveBeenCalledWith({b: {oldValue: 2, newValue: 3}});

        browser.storage.onChanged.emit({a: {oldValue: 1, newValue: 1}}, "local");

        await flushMacrotask();

        expect(callback).toHaveBeenCalledTimes(1);
        unsubscribe();
    });

    test("unsubscribe prevents delivery from an event already queued for formatting", async () => {
        const callback = jest.fn();
        const unsubscribe = storage.subscribe(callback);

        browser.storage.onChanged.emit({theme: {oldValue: "light", newValue: "dark"}}, "local");

        unsubscribe();

        await flushMacrotask();

        expect(callback).not.toHaveBeenCalled();
    });

    test("an unresolved subscriber promise does not block later events", async () => {
        const pending = new Promise<void>(() => undefined);
        const callback = jest.fn().mockReturnValueOnce(pending).mockReturnValue(undefined);
        const unsubscribe = storage.subscribe(callback);

        browser.storage.onChanged.emit({theme: {oldValue: "light", newValue: "dark"}}, "local");
        browser.storage.onChanged.emit({volume: {oldValue: 10, newValue: 20}}, "local");

        await flushMacrotask();

        expect(callback).toHaveBeenCalledTimes(2);
        unsubscribe();
    });

    test("watch callback errors are uncaught without stopping sibling handlers or future events", async () => {
        const errors = captureUnhandledErrors();
        const failure = new Error("watch failed");

        const themeCallback = jest.fn(() => {
            throw failure;
        });

        const volumeCallback = jest.fn();
        const unsubscribe = storage.watch({theme: themeCallback, volume: volumeCallback});

        try {
            browser.storage.onChanged.emit({
                theme: {oldValue: "light", newValue: "dark"},
                volume: {oldValue: 10, newValue: 20},
            }, "local");

            await flushMacrotask();

            expect(themeCallback).toHaveBeenCalledTimes(1);
            expect(volumeCallback).toHaveBeenCalledTimes(1);
            expect(errors.pending).toBe(1);
            expect(() => errors.runNext()).toThrow(failure);

            browser.storage.onChanged.emit({volume: {oldValue: 20, newValue: 30}}, "local");
            await flushMacrotask();

            expect(volumeCallback).toHaveBeenCalledTimes(2);
        } finally {
            unsubscribe();
            errors.restore();
        }
    });

    test("watch only resolves keyed callbacks from own properties", async () => {
        const prototypeCallback = jest.fn();
        const ownCallback = jest.fn();
        const handlers = Object.create({theme: prototypeCallback}) as Record<string, jest.Mock>;
        handlers.volume = ownCallback;
        const unsubscribe = storage.watch(handlers);

        browser.storage.onChanged.emit({
            theme: {oldValue: "light", newValue: "dark"},
            volume: {oldValue: 10, newValue: 20},
        }, "local");

        await flushMacrotask();

        expect(prototypeCallback).not.toHaveBeenCalled();
        expect(ownCallback).toHaveBeenCalledWith(20, 10);
        unsubscribe();
    });

    test("a throwing keyed watcher getter does not block sibling handlers or dispose the watch", async () => {
        const errors = captureUnhandledErrors();
        const failure = new Error("watch getter failed");
        const volumeCallback = jest.fn();
        const handlers: Record<string, jest.Mock> = {volume: volumeCallback};

        Object.defineProperty(handlers, "theme", {
            enumerable: true,
            get: () => {
                throw failure;
            },
        });

        const unsubscribe = storage.watch(handlers);

        try {
            browser.storage.onChanged.emit({
                theme: {oldValue: "light", newValue: "dark"},
                volume: {oldValue: 10, newValue: 20},
            }, "local");

            await flushMacrotask();

            expect(volumeCallback).toHaveBeenCalledTimes(1);
            expect(errors.pending).toBe(1);
            expect(() => errors.runNext()).toThrow(failure);

            browser.storage.onChanged.emit({volume: {oldValue: 20, newValue: 30}}, "local");
            await flushMacrotask();
            expect(volumeCallback).toHaveBeenCalledTimes(2);
        } finally {
            unsubscribe();
            errors.restore();
        }
    });

    test("calls specific key callback on change", async () => {
        const keyCallback = jest.fn();
        await chrome.storage.local.set({theme: "light"});
        storage.watch({theme: keyCallback});

        await chrome.storage["local"].set({theme: "dark"});

        await flushMacrotask();

        expect(keyCallback).toHaveBeenCalledWith("dark", "light");
    });

    test("does not call key callback for unrelated key", async () => {
        const keyCallback = jest.fn();
        await chrome.storage.local.set({volume: 50});
        storage.watch({theme: keyCallback});

        await chrome.storage["local"].set({volume: 80});

        await flushMacrotask();

        expect(keyCallback).not.toHaveBeenCalled();
    });

    test("calls global callback on any change", async () => {
        const globalCallback = jest.fn();
        await chrome.storage.local.set({theme: "light", volume: 50});
        storage.watch(globalCallback);

        await chrome.storage["local"].set({theme: "dark"});

        await chrome.storage["local"].set({volume: 80});

        await flushMacrotask();

        expect(globalCallback).toHaveBeenCalledWith(80, 50, "volume");
        expect(globalCallback).toHaveBeenCalledWith("dark", "light", "theme");
    });

    test("calls both key and global callbacks", async () => {
        const keyCallback = jest.fn();
        const globalCallback = jest.fn();
        await chrome.storage.local.set({theme: "light", volume: 50});
        storage.watch({theme: keyCallback});
        storage.watch(globalCallback);

        await chrome.storage["local"].set({theme: "dark"});

        await chrome.storage["local"].set({volume: 80});

        await flushMacrotask();

        expect(keyCallback).toHaveBeenCalledWith("dark", "light");
        expect(globalCallback).toHaveBeenCalledWith(80, 50, "volume");
        expect(globalCallback).toHaveBeenCalledWith("dark", "light", "theme");
    });
});
