import Storage from "./Storage";

afterEach(() => jest.restoreAllMocks());

test.each([
    ["single", (storage: Storage) => storage.get("theme")],
    ["batch", (storage: Storage) => storage.get(["theme"])],
    ["all", (storage: Storage) => storage.getAll()],
] as const)("preserves runtime.lastError on %s reads, including asynchronous callbacks", async (_mode, read) => {
    const storage = new Storage();
    const message = "Storage backend is unavailable";
    for (const asynchronous of [false, true]) {
        jest.spyOn(chrome.storage.local, "get").mockImplementationOnce(((_keys: unknown, callback: (result: unknown) => void) => {
            const fail = () => {
                const descriptor = Object.getOwnPropertyDescriptor(chrome.runtime, "lastError");
                Object.defineProperty(chrome.runtime, "lastError", {value: {message}, configurable: true});
                try {
                    callback(undefined);
                } finally {
                    if (descriptor) Object.defineProperty(chrome.runtime, "lastError", descriptor);
                    else Reflect.deleteProperty(chrome.runtime, "lastError");
                }
            };
            if (asynchronous) queueMicrotask(fail);
            else fail();
        }) as typeof chrome.storage.local.get);

        await expect(read(storage)).rejects.toEqual(new Error(message));
        expect(chrome.runtime.lastError).toBeUndefined();
    }
});
