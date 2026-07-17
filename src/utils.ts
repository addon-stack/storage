import {STORAGE_KEY_SEPARATOR} from "./constants";

export const hasOwn = (value: object, key: PropertyKey): boolean =>
    Object.getOwnPropertyDescriptor(value, key) !== undefined;

export const setRecordValue = (target: object, key: PropertyKey, value: unknown): void => {
    Object.defineProperty(target, key, {
        configurable: true,
        enumerable: true,
        value,
        writable: true,
    });
};

export const createRecord = <T extends object>(): T => ({}) as T;

export const copyRecordWithoutPrototype = <T extends object>(value: T): T => {
    const copy = Object.create(null) as T;

    for (const key of Object.keys(value)) {
        setRecordValue(copy, key, (value as Record<string, unknown>)[key]);
    }

    return copy;
};

export const copyRecord = <T extends object>(value: T): T => {
    const copy = createRecord<T>();

    for (const key of Object.keys(value)) {
        setRecordValue(copy, key, (value as Record<string, unknown>)[key]);
    }

    return copy;
};

export const isPlainObject = (value: unknown): value is Record<string, unknown> => {
    if (value === null || typeof value !== "object") {
        return false;
    }

    const prototype = Object.getPrototypeOf(value);

    return prototype === Object.prototype || prototype === null;
};

const assertStorageIdentifier = (type: "key" | "namespace", value: string | undefined): void => {
    if (value?.includes(STORAGE_KEY_SEPARATOR)) {
        throw new TypeError(
            `Storage ${type} "${value}" must not contain the namespace separator "${STORAGE_KEY_SEPARATOR}".`
        );
    }
};

export const assertStorageKey = (key: PropertyKey): void => {
    assertStorageIdentifier("key", key.toString());
};

export const assertStorageNamespace = (namespace: string | undefined): void => {
    assertStorageIdentifier("namespace", namespace);
};

export const normalizeStorageNamespace = (namespace: string | undefined): string | undefined => {
    const normalizedNamespace = namespace?.trim();

    return normalizedNamespace || undefined;
};

export const assertStorageSetValue = (value: unknown): void => {
    if (value === undefined) {
        throw new TypeError("Storage set value must not be undefined. Use remove() or update() to delete a value.");
    }
};

export const prepareStorageSetValues = <T extends object>(values: unknown): T => {
    if (!isPlainObject(values)) {
        throw new TypeError("Storage batch set values must be a plain object.");
    }

    const preparedValues = createRecord<T>();

    for (const key of Object.keys(values)) {
        const value = values[key];

        if (value === undefined) {
            throw new TypeError(
                `Storage batch set value for key "${key}" must not be undefined. Use remove() or update() to delete a value.`
            );
        }

        setRecordValue(preparedValues, key, value);
    }

    return preparedValues;
};

export const scheduleUnhandledError = (error: unknown): void => {
    globalThis.queueMicrotask(() => {
        throw error;
    });
};

export const invokeCallback = (callback: () => void | Promise<void>): void => {
    try {
        const result = callback();

        if (result !== undefined) {
            void Promise.resolve(result).catch(scheduleUnhandledError);
        }
    } catch (error) {
        scheduleUnhandledError(error);
    }
};
