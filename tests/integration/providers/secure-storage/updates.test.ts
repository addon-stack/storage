import {browser} from "@tests/support/browser";
import SecureStorage from "~/providers/SecureStorage";

let securedStorage: SecureStorage;

beforeEach(() => {
    securedStorage = new SecureStorage();
});

describe("update method", () => {
    test("skips encryption and storage write when decrypted value is equal", async () => {
        await securedStorage.set("settings", {theme: "dark"});

        const encryptSpy = jest.spyOn(crypto.subtle, "encrypt");
        const setSpy = browser.storage.local.set;
        encryptSpy.mockClear();
        setSpy.reset();

        await securedStorage.update("settings", prev => ({...prev}));

        expect(encryptSpy).not.toHaveBeenCalled();
        expect(setSpy.calls).toHaveLength(0);
        expect((await securedStorage.getAll())["settings"]).toEqual({theme: "dark"});
    });
});
