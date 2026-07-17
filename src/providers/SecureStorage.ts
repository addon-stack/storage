import {STORAGE_KEY_SEPARATOR} from "../constants";
import {StorageCorruptionError} from "../errors";
import {createRecord, hasOwn, setRecordValue} from "../utils";
import AbstractStorage, {
    type AreaOptions,
    type FactoryOptions,
    type StaticMake,
    type StorageOptions,
} from "./AbstractStorage";
import type {StorageLockOptions, StorageProvider, StorageState} from "../types";

type StorageChange = chrome.storage.StorageChange;

const ABSENT = Symbol("absent secure storage value");

export interface SecureStorageOptions extends StorageOptions {
    secureKey?: string;
}

type SecureStorageFactoryOptions = SecureStorageOptions & {key?: string};
type SecureStorageAreaOptions = Omit<SecureStorageFactoryOptions, "area">;

export default class SecureStorage<T extends StorageState = StorageState> extends AbstractStorage<T> {
    private readonly secureKey: string;

    private cryptoKey: CryptoKey | null = null;
    private cryptoKeyPromise: Promise<CryptoKey> | null = null;

    public static override make<S extends StorageState = StorageState>(
        options?: SecureStorageFactoryOptions
    ): StorageProvider<S>;
    public static override make<
        S extends StorageState = StorageState,
        O extends StorageOptions = StorageOptions,
        C extends new (
            options?: O
        ) => StorageProvider<S> = new (
            options?: O
        ) => StorageProvider<S>,
    >(this: C, options?: FactoryOptions<C>): StorageProvider<S>;
    public static override make(options?: any): StorageProvider<StorageState> {
        // biome-ignore lint/complexity/noThisInStatic: Preserve polymorphic static factory dispatch.
        return super.make(options);
    }

    public static override Local<S extends StorageState = StorageState>(
        options?: SecureStorageAreaOptions
    ): StorageProvider<S>;
    public static override Local<
        S extends StorageState = StorageState,
        O extends StorageOptions = StorageOptions,
        C extends new (
            options?: O
        ) => StorageProvider<S> = new (
            options?: O
        ) => StorageProvider<S>,
    >(this: C & {make: StaticMake<S, O>}, options?: AreaOptions<C>): StorageProvider<S>;
    public static override Local(options?: any): StorageProvider<StorageState> {
        // biome-ignore lint/complexity/noThisInStatic: Preserve polymorphic static factory dispatch.
        return this.make({...options, area: "local"});
    }

    public static override Session<S extends StorageState = StorageState>(
        options?: SecureStorageAreaOptions
    ): StorageProvider<S>;
    public static override Session<
        S extends StorageState = StorageState,
        O extends StorageOptions = StorageOptions,
        C extends new (
            options?: O
        ) => StorageProvider<S> = new (
            options?: O
        ) => StorageProvider<S>,
    >(this: C & {make: StaticMake<S, O>}, options?: AreaOptions<C>): StorageProvider<S>;
    public static override Session(options?: any): StorageProvider<StorageState> {
        // biome-ignore lint/complexity/noThisInStatic: Preserve polymorphic static factory dispatch.
        return this.make({...options, area: "session"});
    }

    public static override Sync<S extends StorageState = StorageState>(
        options?: SecureStorageAreaOptions
    ): StorageProvider<S>;
    public static override Sync<
        S extends StorageState = StorageState,
        O extends StorageOptions = StorageOptions,
        C extends new (
            options?: O
        ) => StorageProvider<S> = new (
            options?: O
        ) => StorageProvider<S>,
    >(this: C & {make: StaticMake<S, O>}, options?: AreaOptions<C>): StorageProvider<S>;
    public static override Sync(options?: any): StorageProvider<StorageState> {
        // biome-ignore lint/complexity/noThisInStatic: Preserve polymorphic static factory dispatch.
        return this.make({...options, area: "sync"});
    }

    public static override Managed<S extends StorageState = StorageState>(
        options?: SecureStorageAreaOptions
    ): StorageProvider<S>;
    public static override Managed<
        S extends StorageState = StorageState,
        O extends StorageOptions = StorageOptions,
        C extends new (
            options?: O
        ) => StorageProvider<S> = new (
            options?: O
        ) => StorageProvider<S>,
    >(this: C & {make: StaticMake<S, O>}, options?: AreaOptions<C>): StorageProvider<S>;
    public static override Managed(options?: any): StorageProvider<StorageState> {
        // biome-ignore lint/complexity/noThisInStatic: Preserve polymorphic static factory dispatch.
        return this.make({...options, area: "managed"});
    }

    constructor({secureKey, ...options}: SecureStorageOptions = {}) {
        super(options);

        this.secureKey = secureKey?.trim() || "SecureKey";
    }

    private async generateCryptoKey(): Promise<CryptoKey> {
        if (this.cryptoKey) {
            return this.cryptoKey;
        }

        if (!this.cryptoKeyPromise) {
            this.cryptoKeyPromise = (async () => {
                const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(this.secureKey));

                return await crypto.subtle.importKey("raw", hash.slice(0, 32), {name: "AES-GCM"}, false, [
                    "encrypt",
                    "decrypt",
                ]);
            })();
        }

        try {
            this.cryptoKey = await this.cryptoKeyPromise;

            return this.cryptoKey;
        } finally {
            this.cryptoKeyPromise = null;
        }
    }

    private async encrypt(data: any): Promise<string> {
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const encoded = new TextEncoder().encode(JSON.stringify(data));
        const cryptoKey = await this.generateCryptoKey();
        const cipher = await crypto.subtle.encrypt({name: "AES-GCM", iv}, cryptoKey, encoded);

        return `${btoa(String.fromCharCode(...new Uint8Array(iv)))}:${btoa(String.fromCharCode(...new Uint8Array(cipher)))}`;
    }

    private async decrypt(data: string): Promise<any> {
        const [ivStr, cipherStr] = data.split(":");

        const iv = new Uint8Array(
            atob(ivStr)
                .split("")
                .map(c => c.charCodeAt(0))
        );

        const cipher = new Uint8Array(
            atob(cipherStr)
                .split("")
                .map(c => c.charCodeAt(0))
        );

        const cryptoKey = await this.generateCryptoKey();
        const decrypted = await crypto.subtle.decrypt({name: "AES-GCM", iv}, cryptoKey, cipher);

        return JSON.parse(new TextDecoder().decode(decrypted));
    }

    private async decodeStoredValue(value: unknown | typeof ABSENT, key: PropertyKey): Promise<any | undefined> {
        if (value === ABSENT) {
            return undefined;
        }

        if (typeof value !== "string" || value.length === 0) {
            throw new StorageCorruptionError(
                "SecureStorage",
                key,
                new TypeError("Encrypted storage value must be a non-empty string.")
            );
        }

        try {
            return await this.decrypt(value);
        } catch (error) {
            throw new StorageCorruptionError("SecureStorage", key, error);
        }
    }

    private async decodeChangeSide(
        changes: StorageChange,
        side: "newValue" | "oldValue",
        key: PropertyKey
    ): Promise<any | undefined> {
        const value = hasOwn(changes, side) ? changes[side] : ABSENT;

        return await this.decodeStoredValue(value === undefined ? ABSENT : value, key);
    }

    protected async setUnlocked<K extends keyof T>(key: K, value: T[K]): Promise<void> {
        const encryptedValue = await this.encrypt(value);

        await super.setUnlocked(key, encryptedValue as T[K]);
    }

    protected async setBatchUnlocked(values: Partial<T>): Promise<void> {
        const encryptedEntries = await Promise.all(
            (Object.keys(values) as (keyof T)[]).map(async key => {
                const value = values[key];
                return [key, await this.encrypt(value)] as const;
            })
        );
        const encryptedValues = createRecord<Partial<T>>();

        for (const [key, value] of encryptedEntries) {
            setRecordValue(encryptedValues, key, value as T[typeof key]);
        }

        await super.setBatchUnlocked(encryptedValues);
    }

    protected async getUnlocked<K extends keyof T>(key: K): Promise<T[K] | undefined> {
        const fullKey = this.getFullKey(key);
        const encryptedValues = await this.getStoredItems(fullKey);
        const encryptedValue = hasOwn(encryptedValues, fullKey) ? encryptedValues[fullKey] : ABSENT;

        return await this.decodeStoredValue(encryptedValue, key);
    }

    protected async getBatchUnlocked<K extends keyof T>(keys: readonly K[]): Promise<Partial<Pick<T, K>>> {
        const encryptedValues = await super.getBatchUnlocked(keys);
        const decryptedEntries = await Promise.all(
            (Object.keys(encryptedValues) as K[]).map(async key => {
                const encryptedValue = encryptedValues[key];
                return [key, await this.decodeStoredValue(encryptedValue, key)] as const;
            })
        );
        const decryptedValues = createRecord<Partial<Pick<T, K>>>();

        for (const [key, value] of decryptedEntries) {
            setRecordValue(decryptedValues, key, value as T[K]);
        }

        return decryptedValues;
    }

    public async getAll(): Promise<Partial<T>> {
        const encryptedValues = await this.getAllStoredValues();

        const decryptedValues = createRecord<Partial<Record<keyof T, any>>>();

        const entries = await Promise.all(
            Object.entries(encryptedValues as Record<string, unknown>).map(async ([key, value]) => [
                key,
                await this.decodeStoredValue(value, key),
            ])
        );

        for (const [key, value] of entries) {
            setRecordValue(decryptedValues, key, value);
        }

        return decryptedValues as Partial<T>;
    }

    public async clear(options?: StorageLockOptions): Promise<void> {
        const allValues = await this.getAllStoredValues();

        await this.remove(Object.keys(allValues), options);
    }

    protected async formatChange<P extends T>(
        key: keyof P,
        changes: StorageChange
    ): Promise<{
        key: keyof P;
        newValue: P[keyof P] | undefined;
        oldValue: P[keyof P] | undefined;
    }> {
        const [newValue, oldValue] = await Promise.all([
            this.decodeChangeSide(changes, "newValue", key),
            this.decodeChangeSide(changes, "oldValue", key),
        ]);

        return {key, newValue, oldValue};
    }

    protected getFullKey(key: keyof T): string {
        const logicalKey = this.toLogicalKey(key);

        return ["secure", this.namespace ?? "", logicalKey].join(STORAGE_KEY_SEPARATOR);
    }

    protected decodeFullKey(fullKey: string): keyof T | null {
        const parts = fullKey.split(STORAGE_KEY_SEPARATOR);

        return parts.length === 3 && parts[0] === "secure" && parts[1] === (this.namespace ?? "")
            ? (parts[2] as keyof T)
            : null;
    }
}
