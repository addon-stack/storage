import {installBrowserGlobals} from "@addon-core/browser/testing";

import {browser} from "@tests/support/browser";

export const restoreBrowser = installBrowserGlobals(browser, {
    profile: "chrome",
    environment: typeof document === "undefined" ? "simulate" : "preserve",
});
