# @addon-core/storage

Typed storage for browser extensions with namespaces, atomic updates, encrypted values, bucket-style storage, and React bindings.

[![npm version](https://img.shields.io/npm/v/%40addon-core%2Fstorage.svg?logo=npm)](https://www.npmjs.com/package/@addon-core/storage)
[![npm downloads](https://img.shields.io/npm/dm/%40addon-core%2Fstorage.svg)](https://www.npmjs.com/package/@addon-core/storage)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE.md)

## Why this package

`chrome.storage` is flexible, but it gets noisy quickly:

- keys are just strings;
- namespaces need manual handling;
- read-modify-write flows are easy to break;
- encrypted values require extra boilerplate;
- feature state often ends up scattered across unrelated keys.

`@addon-core/storage` adds a small typed layer on top of `chrome.storage` so storage code stays predictable and easy to read.

## Features

- Simple API: `set`, `get`, `update`, `getAll`, `remove`, `clear`, `watch`
- Atomic `update()` for race-safe writes
- `local`, `session`, `sync`, and `managed` storage areas
- Namespaces for isolating module data
- `SecureStorage` with AES-GCM encryption
- `MonoStorage` for grouping related values under one top-level key
- React hook via `@addon-core/storage/react`

## Installation

```bash
npm i @addon-core/storage
```

## Quick start

```ts
import {Storage} from "@addon-core/storage";

interface SessionState {
    token?: string;
    theme?: "light" | "dark";
}

const storage = Storage.Local<SessionState>();
await storage.set("token", "abc123");
await storage.set("theme", "dark");

const token = await storage.get("token");
const all = await storage.getAll();
```

## Typed storage without boilerplate

Define your storage shape once:

```ts
interface UserSettings {
    theme?: "light" | "dark";
    language?: "en" | "uk";
    shortcutsEnabled?: boolean;
}
```

Create a typed storage instance for the `sync` area:

```ts
import {Storage} from "@addon-core/storage";

const settings = Storage.Sync<UserSettings>({namespace: "settings"});
```

Now all operations are typed:

```ts
await settings.set("theme", "dark");
const theme = await settings.get("theme");
await settings.remove("language");
```

## Atomic updates

If the next value depends on the previous one, use `update()` instead of `get()` + `set()`.

```ts
interface CounterState {
    installCount?: number;
}

const storage = Storage.Local<CounterState>();

await storage.update("installCount", prev => (prev ?? 0) + 1);
```

This is useful for:

- counters;
- retry state;
- toggles;
- queue metadata;
- any concurrent read-modify-write flow.

### With timeout or abort signal

```ts
const controller = new AbortController();

await storage.update(
    "installCount",
    prev => (prev ?? 0) + 1,
    {
        signal: controller.signal,
        timeout: 500,
    }
);
```

### Important note

Atomic operations rely on the Web Locks API.

- `update()` uses locking for safe writes;
- `remove()` and `clear()` are lock-aware too;
- `set()` and `get()` still work without Web Locks;
- if Web Locks are unavailable, atomic operations will throw.

## Storage areas

```ts
import {Storage} from "@addon-core/storage";

const local = Storage.Local<{draft?: string}>();
const session = Storage.Session<{popupOpen?: boolean}>();
const sync = Storage.Sync<{theme?: string}>();
const managed = Storage.Managed<{policyEnabled?: boolean}>();
```

## Namespaces

Use namespaces when different modules may use the same key names.

```ts
const auth = Storage.Local<{token?: string}>({namespace: "auth"});
const ui = Storage.Local<{token?: string}>({namespace: "ui"});
```

These storage instances stay isolated even if the key name is the same.

## Secure storage

`SecureStorage` encrypts values before writing them to `chrome.storage`.

```ts
import {SecureStorage} from "@addon-core/storage";

interface AuthState {
    accessToken?: string;
    refreshToken?: string;
}

const authStorage = SecureStorage.Local<AuthState>({
    namespace: "auth",
    secureKey: "AppSecret",
});

await authStorage.set("accessToken", "jwt-token");
const token = await authStorage.get("accessToken");
```

Use it for tokens, sensitive flags, or other small private values.

## MonoStorage

`MonoStorage` is useful when one feature should live under a single top-level storage key.

For example, keeping popup state together:

```ts
import {Storage} from "@addon-core/storage";

interface PopupState {
    search?: string;
    selectedTab?: "overview" | "history";
    filters?: string[];
}

const popup = Storage.Local<PopupState>({key: "popup"});
```

Then use it like a regular storage instance:

```ts
await popup.set("search", "open tabs");
await popup.update("filters", prev => [...(prev ?? []), "pinned"]);

const state = await popup.getAll();
```

This keeps related values grouped and easier to manage.

## Watching changes

Listen to all keys:

```ts
const unsubscribe = settings.watch((next, prev, key) => {
    console.log("changed", key, {prev, next});
});
```

Or subscribe only to specific keys:

```ts
const unsubscribe = settings.watch({
    theme(next, prev) {
        console.log("theme changed", prev, "->", next);
    },
    language(next, prev) {
        console.log("language changed", prev, "->", next);
    },
});
```

## React

The React adapter is available via `@addon-core/storage/react`.

```tsx
import {useStorage} from "@addon-core/storage/react";

export function ThemeToggle() {
    const [theme, setTheme] = useStorage<"light" | "dark">("theme", "light");

    return (
        <button onClick={() => setTheme(theme === "light" ? "dark" : "light")}>
            Theme: {theme}
        </button>
    );
}
```

You can also pass a custom storage instance:

```tsx
import {Storage} from "@addon-core/storage";
import {useStorage} from "@addon-core/storage/react";

const settings = Storage.Sync<{theme?: "light" | "dark"}>({namespace: "settings"});

export function ThemeToggle() {
    const [theme, setTheme] = useStorage({
        key: "theme",
        storage: settings,
        defaultValue: "light",
    });

    return (
        <button onClick={() => setTheme(theme === "light" ? "dark" : "light")}>
            Theme: {theme}
        </button>
    );
}
```

## Core methods

Every storage instance exposes the same small API:

- `get(key)`
- `set(key, value)`
- `update(key, updater, options?)`
- `getAll()`
- `remove(key | keys, options?)`
- `clear(options?)`
- `watch(callback | handlers)`

## Custom locking

If you need custom lock behavior, pass your own `locker`:

```ts
import {Storage, type StorageLocker} from "@addon-core/storage";

const locker: StorageLocker = {
    async request(name, task) {
        return await task();
    },
};

const storage = new Storage<{count?: number}>({
    area: "local",
    locker,
});
```

## Notes

- Built for browser extensions where `chrome.storage` is available
- `SecureStorage` requires Web Crypto API support
- `chrome.storage` quotas still apply, especially for `sync`
