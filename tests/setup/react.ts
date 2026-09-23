// Registers RTL cleanup and the React act environment before our microtask drain.
import "@testing-library/react";
import {afterEach} from "@jest/globals";

afterEach(async () => {
    // Last unsubscribe releases the shared observer before the next harness reset.
    await Promise.resolve();
});
