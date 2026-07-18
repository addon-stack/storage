import type {
    StorageChanges,
    StorageSubscriber,
    StorageWatchKeyCallback,
    StorageWatchOptions,
} from "./types";
import {watchChanges} from "./watch";
import {captureUnhandledErrors} from "../tests/helpers/async";

interface WatchState {
    first?: string;
    second?: number;
}

const createSubscription = () => {
    let emit: StorageSubscriber<WatchState> = () => undefined;
    const unsubscribe = jest.fn();
    const subscribe = jest.fn((callback: StorageSubscriber<WatchState>) => {
        emit = callback;

        return unsubscribe;
    });

    return {
        emit: (changes: StorageChanges<WatchState>) => emit(changes),
        subscribe,
        unsubscribe,
    };
};

describe("watchChanges", () => {
    test("projects each changed key onto a function watcher", () => {
        const subscription = createSubscription();
        const watcher = jest.fn();
        const stop = watchChanges(
            subscription.subscribe,
            watcher as StorageWatchOptions<WatchState>
        );

        subscription.emit({
            first: {newValue: "after", oldValue: "before"},
            second: {newValue: 2, oldValue: 1},
        });

        expect(subscription.subscribe).toHaveBeenCalledTimes(1);
        expect(watcher).toHaveBeenNthCalledWith(1, "after", "before", "first");
        expect(watcher).toHaveBeenNthCalledWith(2, 2, 1, "second");

        stop();
    });

    test("calls only own object-watcher handlers", () => {
        const subscription = createSubscription();
        const inheritedHandler = jest.fn();
        const ownHandler = jest.fn();
        const watcher = Object.create({first: inheritedHandler}) as StorageWatchKeyCallback<WatchState>;

        Object.defineProperty(watcher, "second", {
            configurable: true,
            enumerable: true,
            value: ownHandler,
        });

        const stop = watchChanges(subscription.subscribe, watcher);

        subscription.emit({
            first: {newValue: "after", oldValue: "before"},
            second: {newValue: 2, oldValue: 1},
        });

        expect(inheritedHandler).not.toHaveBeenCalled();
        expect(ownHandler).toHaveBeenCalledTimes(1);
        expect(ownHandler).toHaveBeenCalledWith(2, 1);

        stop();
    });

    test("stops fan-out immediately and unsubscribes only once", () => {
        const subscription = createSubscription();
        let stop = (): void => undefined;
        const firstHandler = jest.fn(() => stop());
        const secondHandler = jest.fn();

        stop = watchChanges(subscription.subscribe, {
            first: firstHandler,
            second: secondHandler,
        });

        subscription.emit({
            first: {newValue: "after", oldValue: "before"},
            second: {newValue: 2, oldValue: 1},
        });

        expect(firstHandler).toHaveBeenCalledTimes(1);
        expect(secondHandler).not.toHaveBeenCalled();
        expect(subscription.unsubscribe).toHaveBeenCalledTimes(1);

        stop();

        expect(subscription.unsubscribe).toHaveBeenCalledTimes(1);
    });

    test("reports a synchronous handler error without blocking later keys", () => {
        const errors = captureUnhandledErrors();

        try {
            const subscription = createSubscription();
            const callbackError = new Error("sync watcher failure");
            const secondHandler = jest.fn();
            const stop = watchChanges(subscription.subscribe, {
                first: () => {
                    throw callbackError;
                },
                second: secondHandler,
            });

            subscription.emit({
                first: {newValue: "after", oldValue: "before"},
                second: {newValue: 2, oldValue: 1},
            });

            expect(secondHandler).toHaveBeenCalledTimes(1);
            expect(errors.pending).toBe(1);
            expect(() => errors.runNext()).toThrow(callbackError);

            stop();
        } finally {
            errors.restore();
        }
    });

    test("reports an asynchronous handler rejection without blocking later keys", async () => {
        const errors = captureUnhandledErrors();

        try {
            const subscription = createSubscription();
            const callbackError = new Error("async watcher failure");
            const secondHandler = jest.fn();
            const stop = watchChanges(subscription.subscribe, {
                first: () => Promise.reject(callbackError),
                second: secondHandler,
            });

            subscription.emit({
                first: {newValue: "after", oldValue: "before"},
                second: {newValue: 2, oldValue: 1},
            });

            expect(secondHandler).toHaveBeenCalledTimes(1);

            await Promise.resolve();

            expect(errors.pending).toBe(1);
            expect(() => errors.runNext()).toThrow(callbackError);

            stop();
        } finally {
            errors.restore();
        }
    });
});
