# @addon-core/storage

Type-safe, ergonomic wrapper around chrome.storage for browser extensions (WebExtensions) with namespaces, multiple
storage areas, encryption (AES‑GCM), bucket-style storage (MonoStorage), and a React adapter.

[![npm version](https://img.shields.io/npm/v/%40addon-core%2Fstorage.svg?logo=npm)](https://www.npmjs.com/package/@addon-core/storage)
[![npm downloads](https://img.shields.io/npm/dm/%40addon-core%2Fstorage.svg)](https://www.npmjs.com/package/@addon-core/storage)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE.md)

- Simple API: set, get, getAll, remove, clear, watch
- Storage areas: local, session, sync, managed
- Namespaces to logically separate keys
- Secure storage: SecureStorage (AES‑GCM, app key)
- MonoStorage — store multiple values under a single top-level key
- React hook useStorage for two-way binding between state and storage
- First-class TypeScript support (strict typing for keys and values)

## Installation

```bash
# with your preferred package manager
npm i @addon-core/storage
# or
yarn add @addon-core/storage
# or
pnpm add @addon-core/storage
```

Requirements and environment:

- The library targets browser extension environments where chrome.storage is available.
- For the React adapter, peer dependencies react and react-dom are required (optionally @types/react for TypeScript).
- SecureStorage relies on the Web Crypto API (crypto.subtle, AES‑GCM), available in modern browsers.

## Quick start

```ts
import {Storage} from "@addon-core/storage";

// Optionally set a namespace to isolate module keys
const storage = Storage.Local<{ token?: string; theme?: "light" | "dark" }>({namespace: "app"});

await storage.set("token", "abc123");
const token = await storage.get("token"); // "abc123"

await storage.remove("token");
await storage.clear(); // clears only keys from the current namespace (if set)
```

## API overview

The package exports:

- Provider classes: `Storage`, `SecureStorage`, `MonoStorage`
- Types: `StorageProvider`, `StorageState`, `StorageWatchOptions`
- React adapter: `useStorage` from the submodule `@addon-core/storage/react`

### Creating a provider

There are two ways to create a provider instance.

1) Via constructor with options:

```ts
import {Storage} from "@addon-core/storage";

const s1 = new Storage<{ count?: number }>({area: "local", namespace: "counter"});
```

2) Via convenient static factories:

```ts
import {Storage, SecureStorage} from "@addon-core/storage";

const sLocal = Storage.Local<{ user?: string }>({namespace: "app"});
const sSession = Storage.Session<{ tmp?: string }>();
const sSync = Storage.Sync<{ settings?: any }>({namespace: "global"});
const sManaged = Storage.Managed<{ policy?: any }>(); // for policy-managed storage

// SecureStorage — values are encrypted (AES‑GCM) under the reserved prefix "secure:"
const secure = SecureStorage.Local<{ token?: string }>({secureKey: "MyStrongKey", namespace: "auth"});
```

Provider options:

- `area?: "local" | "session" | "sync" | "managed"` — storage area (defaults to `local`)
- `namespace?: string` — optional namespace; keys become `namespace:key`
- For `SecureStorage`: additionally `secureKey?: string` — a string used to derive the encryption key.

### Provider methods

All providers (`Storage`, `SecureStorage`, `MonoStorage`) share the `StorageProvider<T>` interface:

```ts
interface StorageProvider<T> {
    set<K extends keyof T>(key: K, value: T[K]): Promise<void>;

    get<K extends keyof T>(key: K): Promise<T[K] | undefined>;

    getAll(): Promise<Partial<T>>;

    remove<K extends keyof T>(keys: K | K[]): Promise<void>;

    clear(): Promise<void>;

    watch(options: StorageWatchOptions<T>): () => void; // returns an unsubscribe function
}
```

Where `StorageWatchOptions<T>` is either a map of per-key callbacks or a single callback:

```ts
// Option 1: a single handler for all changes
const unsubscribe = storage.watch((next, prev) => {
    console.log("changed", {next, prev});
});

// Option 2: specific handlers per key
const un = storage.watch({
    token(newVal, oldVal) {
        console.log("token changed", newVal, oldVal);
    },
    theme(newVal, oldVal) {
        console.log("theme changed", newVal, oldVal);
    },
});

// Later
un(); // unsubscribe
```

Notes:

- `getAll()` returns only keys that belong to the current provider (considering namespace and type).
- `SecureStorage` transparently encrypts/decrypts values. They are stored as strings, while you work with original types
  externally.

### MonoStorage — a “bucket” under one key

`MonoStorage` lets you keep several values under a single top-level key (a bucket). Handy when you need to atomically
store and update a set of related values.

You can create it in two ways:

1) Explicitly:

```ts
import {MonoStorage, Storage} from "@addon-core/storage";

type Bucket = { a?: number; b?: string };
const base = Storage.Local<Record<"bucket", Partial<Bucket>>>();
const mono = new MonoStorage<Bucket, "bucket">("bucket", base);

await mono.set("a", 1);
await mono.set("b", "x");
console.log(await mono.getAll()); // { a: 1, b: "x" }
```

2) Via the factory with the `key` parameter — you’ll get MonoStorage right away:

```ts
import {Storage} from "@addon-core/storage";

const mono = Storage.Local<{ a?: number; b?: string }>({key: "bucket"});
await mono.set("a", 1);
```

Highlights:

- When the last value in the “bucket” is removed, the top-level key is cleared entirely.
- `watch()` in MonoStorage invokes callbacks only on actual value changes (shallow comparison).

### SecureStorage — value encryption

```ts
import {SecureStorage} from "@addon-core/storage";

type Auth = { token?: string; profile?: { id: string } };
const secure = SecureStorage.Local<Auth>({secureKey: "AppSecret", namespace: "auth"});

await secure.set("token", "jwt.token.value");
const token = await secure.get("token"); // decrypted
```

Under the hood AES‑GCM (Web Crypto API) is used. Don’t keep `secureKey` in public code — obtain it from protected
sources (e.g., native settings, enterprise policy, remote configuration, etc.).

## React adapter

The submodule `@addon-core/storage/react` provides the `useStorage` hook to synchronize component state with
chrome.storage.

Signatures (simplified):

```ts
// useStorage<T>(options: { key: string; storage?: StorageProvider<Record<string, any>>; defaultValue?: T }):
//   readonly [T | undefined, (v: T) => void, () => void]
// useStorage<T>(key: string, defaultValue?: T):
//   readonly [T | undefined, (v: T) => void, () => void]
```

Basic example:

```tsx
import React from "react";
import {useStorage} from "@addon-core/storage/react";

export function ThemeSwitch() {
    const [theme, setTheme] = useStorage<"light" | "dark">("theme", "light");

    return (
        <button onClick={() => setTheme(theme === "light" ? "dark" : "light")}>Theme: {theme}</button>
    );
}
```

Using a custom provider and default value:

```tsx
import React from "react";
import {Storage} from "@addon-core/storage";
import {useStorage} from "@addon-core/storage/react";

const storage = Storage.Sync<Record<string, any>>({namespace: "app"});

export function Profile() {
    const [name, setName, removeName] = useStorage<string>({key: "name", storage, defaultValue: "Anonymous"});

    return (
        <div>
            <input value={name ?? ""} onChange={e => setName(e.target.value)}/>
            <button onClick={removeName}>Reset</button>
        </div>
    );
}
```

## Practical tips

- Don’t mix data from different modules — use `namespace`.
- To sync settings across devices, use the `sync` area.
- In test environments, use WebExtensions mocks (e.g., `jest-webextension-mock`).
- Don’t store large amounts of data — `chrome.storage` has quotas. Store settings and lightweight data only.
