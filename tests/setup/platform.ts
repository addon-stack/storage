import {webcrypto} from "node:crypto";
import {TextDecoder, TextEncoder} from "node:util";

import {createWebLocksMock} from "@tests/support/web-locks";

Object.defineProperties(globalThis, {
    crypto: {value: webcrypto, configurable: true},
    TextEncoder: {value: TextEncoder, configurable: true},
    TextDecoder: {value: TextDecoder, configurable: true},
});

if (!globalThis.navigator) {
    Object.defineProperty(globalThis, "navigator", {value: {}, configurable: true});
}

Object.defineProperty(navigator, "locks", {value: createWebLocksMock(), writable: true, configurable: true});
