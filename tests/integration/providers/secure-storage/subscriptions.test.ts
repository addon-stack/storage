import {captureUnhandledErrors, deferred, flushMacrotask, waitFor} from "@tests/support/async";
import {browser} from "@tests/support/browser";
import {encryptedFixture} from "@tests/support/storage";
import {StorageCorruptionError} from "~/errors";
import SecureStorage from "~/providers/SecureStorage";

let securedStorage: SecureStorage;

interface SecureBatchState {
    accessToken?: string;
    refreshToken?: string;
    attempts?: number;
}

beforeEach(() => {
    securedStorage = new SecureStorage();
});

describe("watch and subscribe methods", () => {
    test("event decoding ignores inherited change sides", async () => {
        const storage = new SecureStorage<SecureBatchState>({namespace: "event-own-fields"});
        const encryptedOldValue = await encryptedFixture("old");
        const callback = jest.fn();
        const errors = captureUnhandledErrors();
        const unsubscribe = storage.subscribe(callback);
        const change = Object.create({newValue: {corrupted: true}}) as chrome.storage.StorageChange;

        Object.defineProperty(change, "oldValue", {
            enumerable: true,
            value: encryptedOldValue,
        });

        try {
            browser.storage.onChanged.emit({"secure:event-own-fields:accessToken": change}, "local");
            await flushMacrotask();

            await waitFor(() => expect(callback).toHaveBeenCalledWith({
                accessToken: {oldValue: "old", newValue: undefined},
            }));

            expect(errors.pending).toBe(0);
        } finally {
            unsubscribe();
            errors.restore();
        }
    });

    test("event decoding treats omitted and own undefined sides as absent", async () => {
        const storage = new SecureStorage<SecureBatchState>({namespace: "event-absence"});
        const encryptedValue = await encryptedFixture("value");
        const callback = jest.fn();
        const unsubscribe = storage.subscribe(callback);

        browser.storage.onChanged.emit({"secure:event-absence:accessToken": {newValue: encryptedValue}}, "local");

        browser.storage.onChanged.emit({"secure:event-absence:accessToken": {oldValue: encryptedValue}}, "local");

        browser.storage.onChanged.emit({"secure:event-absence:accessToken": {
            oldValue: undefined,
            newValue: encryptedValue,
        }}, "local");

        browser.storage.onChanged.emit({"secure:event-absence:accessToken": {
            oldValue: encryptedValue,
            newValue: undefined,
        }}, "local");

        await flushMacrotask();

        await waitFor(() => expect(callback).toHaveBeenCalledTimes(4));

        expect(callback.mock.calls).toEqual([
            [{accessToken: {oldValue: undefined, newValue: "value"}}],
            [{accessToken: {oldValue: "value", newValue: undefined}}],
            [{accessToken: {oldValue: undefined, newValue: "value"}}],
            [{accessToken: {oldValue: "value", newValue: undefined}}],
        ]);

        unsubscribe();
    });

    test("subscribe decrypts one native multi-key event into one logical change map", async () => {
        const storage = new SecureStorage<SecureBatchState>({namespace: "auth"});
        const callback = jest.fn();
        await storage.set({accessToken: "old", attempts: 1});
        const unsubscribe = storage.subscribe(callback);

        await storage.set({accessToken: "new", attempts: 2});

        await waitFor(() => expect(callback).toHaveBeenCalledTimes(1));

        await waitFor(() => expect(callback).toHaveBeenCalledWith({
            accessToken: {oldValue: "old", newValue: "new"},
            attempts: {oldValue: 1, newValue: 2},
        }));

        unsubscribe();
    });

    test("subscribe filters changes whose decrypted values are equal", async () => {
        const storage = new SecureStorage<SecureBatchState>();
        const callback = jest.fn();
        await storage.set({accessToken: "same", attempts: 1});
        const unsubscribe = storage.subscribe(callback);

        await storage.set({accessToken: "same", attempts: 2});

        await waitFor(() => expect(callback).toHaveBeenCalledTimes(1));
        await waitFor(() => expect(callback).toHaveBeenCalledWith({attempts: {oldValue: 1, newValue: 2}}));
        unsubscribe();
    });

    test("serializes decrypt formatting while not waiting for subscriber promises", async () => {
        const storage = new SecureStorage<{value?: string}>({namespace: "ordered"});
        const firstCipher = await encryptedFixture("first");
        const secondCipher = await encryptedFixture("second");
        const started = deferred();
        const release = deferred<ArrayBuffer>();

        const decrypt = jest.spyOn(crypto.subtle, "decrypt").mockImplementationOnce(() => {
            started.resolve();

            return release.promise;
        });

        const subscriber = deferred();
        const callback = jest.fn().mockReturnValueOnce(subscriber.promise).mockReturnValue(undefined);
        const stop = storage.subscribe(callback);

        try {
            await browser.storage.onChanged.emit({"secure:ordered:value": {newValue: firstCipher}}, "local");
            await started.promise;

            await browser.storage.onChanged.emit({"secure:ordered:value": {
                oldValue: firstCipher, newValue: secondCipher,
            }}, "local");

            expect(decrypt).toHaveBeenCalledTimes(1);
            release.resolve(new TextEncoder().encode(JSON.stringify("first")).buffer);
            await waitFor(() => expect(callback).toHaveBeenCalledTimes(2));
            expect(callback).toHaveBeenNthCalledWith(1, {value: {oldValue: undefined, newValue: "first"}});
            expect(callback).toHaveBeenNthCalledWith(2, {value: {oldValue: "first", newValue: "second"}});
        } finally {
            subscriber.resolve();
            stop();
        }
    });

    test("unsubscribe during decrypt prevents late callback and future delivery", async () => {
        const storage = new SecureStorage<{value?: string}>({namespace: "unsubscribe-pending"});
        const ciphertext = await encryptedFixture("decoded");
        const started = deferred();
        const release = deferred<ArrayBuffer>();

        const decrypt = jest.spyOn(crypto.subtle, "decrypt").mockImplementationOnce(() => {
            started.resolve();

            return release.promise;
        });

        const callback = jest.fn();
        const stop = storage.subscribe(callback);

        try {
            await browser.storage.onChanged.emit({"secure:unsubscribe-pending:value": {newValue: ciphertext}}, "local");
            await started.promise;
            stop();
            release.resolve(new TextEncoder().encode(JSON.stringify("decoded")).buffer);
            await flushMacrotask();
            await browser.storage.onChanged.emit({"secure:unsubscribe-pending:value": {newValue: ciphertext}}, "local");
            await flushMacrotask();
            expect(callback).not.toHaveBeenCalled();
            expect(decrypt).toHaveBeenCalledTimes(1);
        } finally {
            stop();
        }
    });

    test("a keyed watch handler can unsubscribe before later handlers in the same event", async () => {
        const storage = new SecureStorage<{theme?: string; volume?: number}>({namespace: "watch-unsubscribe"});
        const volumeCallback = jest.fn();
        let unsubscribe: () => void = () => undefined;
        const themeCallback = jest.fn(() => unsubscribe());

        await storage.set({theme: "light", volume: 10});
        unsubscribe = storage.watch({theme: themeCallback, volume: volumeCallback});

        try {
            await storage.set({theme: "dark", volume: 20});

            await waitFor(() => expect(themeCallback).toHaveBeenCalledTimes(1));
            await waitFor(() => expect(themeCallback).toHaveBeenCalledWith("dark", "light"));
            expect(volumeCallback).not.toHaveBeenCalled();
        } finally {
            unsubscribe();
        }
    });

    test("corruption in an unrelated key kills watch without partial or future delivery", async () => {
        const storage = new SecureStorage<{theme?: string; unrelated?: string}>({namespace: "event-corruption"});
        const themeCallback = jest.fn();
        const errors = captureUnhandledErrors();
        await storage.set({theme: "dark"});
        const unsubscribe = storage.watch({theme: themeCallback});

        try {
            const oldTheme = await encryptedFixture("light");
            const newTheme = await encryptedFixture("dark");

            browser.storage.onChanged.emit({
                "secure:event-corruption:theme": {oldValue: oldTheme, newValue: newTheme},
                "secure:event-corruption:unrelated": {oldValue: null, newValue: {corrupted: true}},
            }, "local");

            await waitFor(() => expect(errors.pending).toBe(1));

            expect(themeCallback).not.toHaveBeenCalled();
            expect(() => errors.runNext()).toThrow(StorageCorruptionError);

            await storage.set({theme: "later"});

            expect(themeCallback).not.toHaveBeenCalled();
            expect(errors.pending).toBe(0);
        } finally {
            unsubscribe();
            errors.restore();
        }
    });

    test("calls specific key callback on change", async () => {
        const keyCallback = jest.fn();

        await securedStorage.set({theme: "light"});
        securedStorage.watch({theme: keyCallback});

        await securedStorage.set({theme: "dark"});

        await waitFor(() => expect(keyCallback).toHaveBeenCalledWith("dark", "light"));
    });

    test("does not call key callback for unrelated key", async () => {
        const callback = jest.fn();
        const delivered = deferred();
        const stopWatch = securedStorage.watch({theme: callback});
        const stopSubscription = securedStorage.subscribe(() => delivered.resolve());

        try {
            await securedStorage.set("volume", 80);
            await delivered.promise;
            expect(callback).not.toHaveBeenCalled();
        } finally {
            stopWatch();
            stopSubscription();
        }
    });

    test("calls global callback on any change", async () => {
        const globalCallback = jest.fn();
        await securedStorage.set({theme: "light", volume: 50});
        securedStorage.watch(globalCallback);

        await securedStorage.set({theme: "dark"});

        await securedStorage.set({volume: 80});

        await waitFor(() => expect(globalCallback).toHaveBeenCalledWith(80, 50, "volume"));
        await waitFor(() => expect(globalCallback).toHaveBeenCalledWith("dark", "light", "theme"));
    });

    test("calls both key and global callbacks", async () => {
        const keyCallback = jest.fn();
        const globalCallback = jest.fn();
        await securedStorage.set({theme: "light", volume: 50});
        securedStorage.watch({theme: keyCallback});
        securedStorage.watch(globalCallback);

        await securedStorage.set({theme: "dark"});

        await securedStorage.set({volume: 80});

        await waitFor(() => expect(keyCallback).toHaveBeenCalledWith("dark", "light"));
        await waitFor(() => expect(globalCallback).toHaveBeenCalledWith(80, 50, "volume"));
        await waitFor(() => expect(globalCallback).toHaveBeenCalledWith("dark", "light", "theme"));
    });

    test("terminates a watch and schedules an uncaught error for a corrupted change", async () => {
        const keyCallback = jest.fn();
        const errors = captureUnhandledErrors();

        try {
            securedStorage.watch({theme: keyCallback});

            browser.storage.onChanged.emit({"secure::theme": {oldValue: null, newValue: {theme: "dark"}}}, "local");

            browser.storage.onChanged.emit({"secure::theme": {oldValue: "ignored", newValue: "ignored-too"}}, "local");

            await flushMacrotask();

            expect(keyCallback).not.toHaveBeenCalled();
            expect(errors.pending).toBe(1);
            expect(() => errors.runNext()).toThrow(StorageCorruptionError);

            browser.storage.onChanged.emit({"secure::theme": {
                oldValue: "still-ignored",
                newValue: "still-ignored-too",
            }}, "local");

            await flushMacrotask();
            expect(keyCallback).not.toHaveBeenCalled();
        } finally {
            errors.restore();
        }
    });
});
