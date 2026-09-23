import {createBrowserHarness, installBrowserGlobals} from "@addon-core/browser/testing";

// Keep facade identity stable: the default observer retains its provider between tests.
// Each Jest file gets its own module instance and harness.
export const browser = createBrowserHarness();

// Use explicit seeds for read-only policy tests; regular tests share the stable empty harness.
export const withBrowser = async <T>(
    options: Parameters<typeof createBrowserHarness>[0],
    run: (harness: ReturnType<typeof createBrowserHarness>) => Promise<T>
): Promise<T> => {
    const fixture = createBrowserHarness(options);
    const restore = installBrowserGlobals(fixture, {environment: "preserve"});

    try {
        return await run(fixture);
    } finally {
        fixture.reset();
        restore();
    }
};
