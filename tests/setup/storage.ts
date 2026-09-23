import {afterAll, afterEach, beforeEach} from "@jest/globals";

import {restoreBrowser} from "./browser";

import {browser} from "@tests/support/browser";

beforeEach(() => browser.reset());

afterEach(async () => {
    await browser.storage.flushChanges();
});

afterAll(() => {
    browser.reset();
    restoreBrowser();
});
