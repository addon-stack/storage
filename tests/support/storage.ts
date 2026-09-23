import {browser} from "./browser";

import SecureStorage from "~/providers/SecureStorage";

// Malformed/native event fixtures need ciphertext. Generate it through the public provider.
export const encryptedFixture = async (value: unknown): Promise<string> => {
    const storage = new SecureStorage({namespace: "test-fixture"});
    await storage.set("value", value);
    const encrypted = browser.storage.local.data["secure:test-fixture:value"];
    await storage.remove("value");

    if (typeof encrypted !== "string") throw new Error("Expected encrypted fixture");

    return encrypted;
};
