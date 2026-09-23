import {afterEach, beforeEach, jest} from "@jest/globals";

import {createWebLocksMock} from "@tests/support/web-locks";

beforeEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
    Object.defineProperty(navigator, "locks", {value: createWebLocksMock(), writable: true, configurable: true});
});

afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
});
