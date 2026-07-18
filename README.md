# @addon-core/storage

Typed storage for browser extensions with namespaces, lock-coordinated updates, encrypted values, bucket-style
storage, and React bindings.

[![npm version](https://img.shields.io/npm/v/%40addon-core%2Fstorage.svg?logo=npm&style=for-the-badge)](https://www.npmjs.com/package/@addon-core/storage)
[![npm downloads](https://img.shields.io/npm/dm/%40addon-core%2Fstorage.svg?style=for-the-badge&color=blue)](https://www.npmjs.com/package/@addon-core/storage)
[![CI](https://img.shields.io/github/actions/workflow/status/addon-stack/storage/ci.yml?style=for-the-badge)](https://github.com/addon-stack/storage/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge)](LICENSE.md)

## Why this package

`chrome.storage` is flexible, but it gets noisy quickly:

- storage keys are untyped and easy to mistype;
- namespaces need manual handling;
- read-modify-write flows are easy to break;
- encrypted values require extra boilerplate;
- feature state often ends up scattered across unrelated keys.

`@addon-core/storage` adds a small typed layer on top of `chrome.storage` so storage code stays predictable and easy to read.

## Features

- Typed single-key and batch overloads for `get`, `set`, and `update`
- Optional state contracts for both quick experimentation and strict typing
- Laravel-style functional helpers for provider creation and one-shot reads/writes
- Lock-coordinated `update()` for race-safe single-key and batch writes
- Per-key and per-event subscriptions through `watch()` and `subscribe()`
- `local`, `session`, `sync`, and `managed` storage areas
- Namespaces for isolating module data
- `SecureStorage` with AES-GCM encryption
- `MonoStorage` for grouping related values under one top-level key
- React hook via `@addon-core/storage/react`

## Installation

### npm

```bash
npm i @addon-core/storage
```

### pnpm

```bash
pnpm add @addon-core/storage
```

### yarn

```bash
yarn add @addon-core/storage
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

## Start without a state contract

A state interface is optional. Omit the generic when experimenting or when the
stored shape is intentionally dynamic:

```ts
import {Storage} from "@addon-core/storage";

const storage = Storage.Local({namespace: "playground"});

await storage.set("theme", "dark");
await storage.set("attempts", 3);
await storage.set("profile", {name: "Ada"});

const theme = await storage.get("theme"); // any
```

This is a deliberately loose TypeScript mode: keys and values are not tied to a
compile-time schema. It does not relax the package's runtime validation—top-level
`undefined` is still rejected, invalid keys still throw, and the browser's
serialization rules still apply. Add a state interface when the shape becomes
stable and key/value mistakes should be caught by TypeScript.

## Functional helpers

Use the functional API when a class factory is more ceremony than the operation
needs:

```ts
import {
    storage,
    storageLocal,
    storageManaged,
    storageSecure,
    storageSession,
    storageSync,
} from "@addon-core/storage";

await storageLocal<string>("draft", "Hello");

const draft = await storageLocal<string>("draft");
// string | undefined

const selected = await storageSync<{
    language?: string;
    theme?: "light" | "dark";
}>(["theme", "language"]);
// Partial<{language?: string; theme?: "light" | "dark"}>
```

With one string argument the generic describes the expected value. With a key
array it describes the returned map. Without a generic, one-shot operations use
the loose default state and values are `any`.

Calling a helper without a key returns a real provider rather than a proxy or a
callable facade:

```ts
interface UserSettings {
    attempts?: number;
    theme?: "light" | "dark";
}

const settings = storageSync<UserSettings>({namespace: "settings"});

await settings.set("theme", "dark");
await settings.update("attempts", value => (value ?? 0) + 1);
```

`storage()` selects local storage by default and accepts an explicit `area`.
`storageLocal()`, `storageSession()`, `storageSync()`, and `storageManaged()`
select a fixed area and therefore do not accept an `area` option.

Secure helpers use one general function to avoid multiplying area-specific
exports:

```ts
interface AuthState {
    accessToken?: string;
}

const auth = storageSecure<AuthState>({
    area: "session",
    namespace: "auth",
    secureKey: "AppSecret",
});

await auth.set("accessToken", "jwt-token");
```

Pass `{key}` to any provider-form helper to create `MonoStorage`. A plain object
argument is always interpreted as helper options, so direct batch set is not a
helper overload. Create a provider and use its regular method instead:

```ts
const local = storageLocal<UserSettings>();

await local.set({
    attempts: 1,
    theme: "dark",
});
```

Every helper invocation creates a new provider. Keep the returned provider when
performing a series of operations, especially with namespaces, custom lockers,
or secure storage. In particular, every one-shot `storageSecure()` call creates
a new provider and repeats the SHA-256 digest and AES key import. Reuse one secure
provider for a series of encrypted operations. Top-level `undefined` remains
invalid for set operations, and managed storage retains its browser-enforced
read-only behavior.

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

## Batch operations

Pass an array of keys or an object of values to the regular `get`, `set`, and
`update` methods when several values should be handled together. The overloads
preserve the same key and value types as their single-key forms.

Read selected keys with one native storage request:

```ts
const values = await settings.get(["theme", "language"] as const);

console.log(values.theme);
console.log(values.language);
```

Missing keys are omitted from the returned object. An empty key list returns an
empty object.

Write several values with one native `storage.set()` call:

```ts
await settings.set({
    theme: "dark",
    language: "uk",
    shortcutsEnabled: true,
});
```

Both forms of `set()` reject `undefined` before encryption, locking, or native
I/O. Use `remove(keys)` or an `update()` patch when keys should be deleted. The
object form must be a plain object; arrays, class instances, and other values are
rejected instead of being interpreted as key maps.

`set()` means "perform this write" and does not elide deeply equal values.
`update()` is the conditional API: its comparer decides whether a physical write
is needed. `watch()` and `subscribe()` still report only logical value changes.

When values change, this single native write produces one `storage.onChanged`
event containing the changed keys. Use `subscribe()` when the package-level
subscriber should also run once for that event.

### Lock-coordinated batch updates

The array overload of `update()` locks the selected keys, reads one snapshot,
and applies the returned patch without races against other lock-aware package
operations:

```ts
const next = await settings.update(
    ["theme", "language", "shortcutsEnabled"] as const,
    prev => ({
        theme: prev.theme === "dark" ? "light" : "dark",
        language: prev.language ?? "en",
    })
);

console.log(next.theme);
```

The updater may be synchronous or asynchronous. A selected key omitted from the
patch stays unchanged. An own property whose value is `undefined` removes that
key. Returning a key that was not included in the key list throws before any
write is made. The returned object is the final snapshot of the selected keys;
removed keys are omitted.

Lock acquisition and one aggregate equality check can be configured for the
whole batch:

```ts
const controller = new AbortController();

const result = await settings.update(
    ["theme", "language"] as const,
    prev => ({
        theme: "dark",
        language: prev.language ?? "en",
    }),
    {
        signal: controller.signal,
        timeout: 500,
        compare: (prev, next) =>
            prev.theme === next.theme &&
            (prev.language ?? "en") === (next.language ?? "en"),
    }
);
```

The batch comparer receives two complete snapshots of the selected keys. The
first is the stored snapshot passed to the updater. The second is the proposed
snapshot after merging the updater's patch: omitted keys stay unchanged and own
properties set to `undefined` are removed.

Returning `true` skips the whole batch. Nothing is written or removed, and
`update()` resolves to the previous stored snapshot. Returning `false` applies
the complete explicit patch, including defined values that are deeply equal to
their stored values, and resolves to the resulting snapshot. The comparer makes
one decision for the batch; it is not a per-key filter. Select which keys to
change by including only those keys in the updater's patch.

Without a custom batch comparer, each explicit patch value uses deep equality.
Only changed values are written, only existing keys requested for deletion are
removed, and equal or omitted keys cause no native write. This default keeps the
physical update minimal.

The `timeout` applies to each selected lock acquisition, not as one deadline
for the whole batch. Direct `set()` calls and raw native storage writes do not
participate in these locks.

For regular `Storage` and `SecureStorage`, a patch that both writes values and
deletes keys requires one native `set()` followed by one native `remove()`.
That mixed operation therefore emits two native change events. If one event is
required, keep writes and deletions out of the same patch, or use `MonoStorage`,
where the logical values share one physical bucket. Consequently,
`subscribe()` can run twice for a mixed regular or secure update, while the
same `MonoStorage` update changes its bucket once and produces one callback.

This two-phase operation is not a transaction. If `set()` completes and the
following `remove()` fails, the promise rejects with
`StoragePartialUpdateError`. Its `appliedSetKeys` and `attemptedRemoveKeys`
arrays contain logical keys, while `cause` contains the native removal error.
Only regular `Storage` and `SecureStorage` can throw this error; `MonoStorage`
commits the logical batch through one physical bucket operation. No rollback is
attempted. Extension context termination between the two native calls can leave
the same torn state without an observable JavaScript exception.

## Lock-coordinated updates

If the next value depends on the previous one, use `update()` instead of `get()` + `set()`.
This is especially useful in browser extensions, where the same storage value can
be updated from different contexts. Lock-coordinated updates keep each
read-modify-write operation consistent with other package operations that use
the same locks, so one context does not overwrite changes made by another.

```ts
interface CounterState {
    installCount?: number;
}

const storage = Storage.Local<CounterState>();

await storage.update("installCount", prev => (prev ?? 0) + 1);
```

Use it for extension state that can be touched from more than one context:

- install or usage counters;
- retry state shared by background and UI;
- popup or options toggles;
- queue metadata for background jobs;
- any read-modify-write flow shared across extension contexts.

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

### Custom compare

`update()` skips writes when the value returned by the updater is equal to the
stored value. Pass `compare` when a specific update needs custom equality rules.
The comparer receives the stored previous value and the next value produced by
the updater.

```ts
await storage.update(
    "settings",
    prev => ({...prev, theme: "dark"}),
    {
        compare: (prev, next) => prev?.version === next?.version,
    }
);
```

If `compare` returns `true`, no write is made and `update()` resolves to the
previous stored value, not the value proposed by the updater. This also means no
`watch()` callbacks are triggered for that update. If it returns `false`, the
next value is written and returned. Use `compare: () => false` when you need to
force a physical write. It cannot force a logical notification:
`storage.onChanged` contains no provenance for the write, and equal logical
values are filtered by observers.

### Important note

Lock-coordinated operations rely on the Web Locks API.

- both overloads of `update()` use locking for safe writes;
- `Storage` and `SecureStorage` acquire selected key locks in a stable order,
  while `MonoStorage` locks its single physical bucket;
- `remove()` and `clear()` are lock-aware too;
- reads work without Web Locks;
- direct `Storage` and `SecureStorage` writes through either `set()` overload do
  not require Web Locks, while `MonoStorage` locks these writes because changing
  a logical field is a read-modify-write of its bucket;
- if Web Locks are unavailable, lock-coordinated operations will throw.

`signal` and `timeout` apply only while a lock request is queued. Once the lock
has been granted, aborting the signal does not cancel the updater.

## Storage areas

```ts
import {Storage} from "@addon-core/storage";

const local = Storage.Local<{draft?: string}>();
const session = Storage.Session<{popupOpen?: boolean}>();
const sync = Storage.Sync<{theme?: string}>();
const managed = Storage.Managed<{policyEnabled?: boolean}>();
```

The `managed` area is read-only. Both `get()` overloads and `getAll()` can read
managed policy values. A mutation rejects when it reaches a native managed-area
write. A package-level no-op may still resolve because no native write is made;
examples include `set({})`, `update([])`, `remove([])`, and an `update()` whose
result compares equal to the current value. Do not interpret a resolved no-op as
write access to managed storage.

## Namespaces

Use namespaces when different modules may use the same key names.

```ts
const auth = Storage.Local<{token?: string}>({namespace: "auth"});
const ui = Storage.Local<{token?: string}>({namespace: "ui"});
```

These storage instances stay isolated even if the key name is the same.

The colon (`:`) is reserved as the separator in physical storage keys.
Namespaces and top-level logical keys used by `Storage` or `SecureStorage`
therefore cannot contain `:`. The physical bucket key passed as `{key}` to a
package factory follows the same rule, while logical field names inside a
`MonoStorage` bucket may contain `:`. Entries previously written with a colon in
a restricted component are not migrated or removed automatically; clean them up
by their exact physical key through the native `chrome.storage.<area>` API before
using the provider.

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

Secure physical keys always have three segments:

```text
secure:<namespace-or-empty>:<logical-key>
```

For example, an unnamespaced `theme` key is stored as `secure::theme`, while an
`accessToken` in the `auth` namespace is stored as `secure:auth:accessToken`.
This fixed shape keeps unnamespaced secure data separate from plain
`Storage({namespace: "secure"})`, whose corresponding key is `secure:theme`.

Older namespaced SecureStorage keys already use the current shape and require no
migration. Older unnamespaced keys used `secure:key` and are not read, migrated,
or removed automatically. Migrate only explicitly known legacy SecureStorage
entries through the matching native storage area:

```ts
const legacyKey = "secure:theme";
const currentKey = "secure::theme";
const values = await chrome.storage.local.get([legacyKey, currentKey]);

if (Object.prototype.hasOwnProperty.call(values, currentKey)) {
    throw new Error(`Refusing to overwrite ${currentKey}`);
}

if (Object.prototype.hasOwnProperty.call(values, legacyKey)) {
    await chrome.storage.local.set({[currentKey]: values[legacyKey]});
    await chrome.storage.local.remove(legacyKey);
}
```

The ciphertext can be copied without decryption because the physical key is not
used as AES-GCM additional authenticated data. Do not migrate `secure:key` by
pattern alone: the same legacy key may belong to plain
`Storage({namespace: "secure"})`.

`SecureStorage` treats a present empty, non-string, or undecipherable value as
corruption and throws the exported `StorageCorruptionError`. Its `provider` and
`key` identify the failed logical entry, and `cause` preserves the format or
decryption error. A corrupted key rejects `get()`, a selected-key batch `get()`,
and the whole `getAll()` result; reads do not silently fall back to defaults.
This can intentionally fail an extension boot path that depends on `getAll()`.

Direct `SecureStorage` operations can recover known corrupted data without
decrypting it: overwrite the key with `set()`, delete a known key with `remove()`,
or delete the provider contents with `clear()`. `remove()` and `clear()` never
decrypt stored ciphertext. `getAll()`, events, and `clear()` only consider keys
with the exact current physical shape; malformed and legacy keys require raw
cleanup.

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
await popup.set({
    search: "open tabs",
    selectedTab: "overview",
});
await popup.update("filters", prev => [...(prev ?? []), "pinned"]);

const state = await popup.getAll();
```

This keeps related values grouped and easier to manage. `MonoStorage.set()`
performs one locked bucket update and writes even when the supplied logical value
is deeply equal. Its batch writes and updates also change that bucket only once.
A present non-plain-object bucket is treated as corrupted rather than as an empty
bucket. `clear()` can still remove it without decoding it.

### Corruption recovery

Recovery differs because `SecureStorage` stores keys independently, while
`MonoStorage` must decode its complete bucket before changing one logical field:

| Provider | `set()` | `remove()` | `clear()` |
| --- | --- | --- | --- |
| `SecureStorage` | Recovers a known key by replacing its ciphertext without reading the old value. | Recovers known keys by removing their physical entries without decrypting them. | Enumerates matching physical keys and removes them without decrypting their values. |
| `MonoStorage` over `Storage` | Cannot recover a corrupted bucket because changing one field first reads and decodes the bucket. | Cannot remove a logical field from a corrupted bucket for the same reason. | Recovers by removing the single physical bucket directly. |
| `MonoStorage` over `SecureStorage` | Cannot recover a corrupted ciphertext or decoded bucket because changing one field first decrypts and decodes the bucket. | Cannot remove a logical field from a corrupted bucket for the same reason. | Recovers by removing the encrypted physical bucket without decrypting it. |

For a corrupted `MonoStorage` bucket, use `clear()` or remove/replace its exact
physical bucket through the underlying provider or native storage API. Ordinary
logical `set()`, `update()`, and `remove()` calls intentionally fail instead of
coercing damaged data into a new bucket.

## Watching changes

Listen to all keys:

```ts
const unsubscribe = settings.watch((next, prev, key) => {
    console.log("changed", key, {prev, next});
});
```

Or watch only specific keys:

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

`watch()` is key-oriented: when one native storage event contains several keys,
its global callback runs once for each changed logical key. Use `subscribe()` to
handle the same event as one typed changes map:

```ts
const unsubscribe = settings.subscribe(changes => {
    if (changes.theme) {
        console.log("theme", changes.theme.oldValue, "->", changes.theme.newValue);
    }

    if (changes.language) {
        console.log("language", changes.language.oldValue, "->", changes.language.newValue);
    }
});
```

`subscribe()` handles each matching native event after namespace filtering and
deep-equality filtering. `SecureStorage` decrypts the values first, and
`MonoStorage` expands its physical bucket change into logical key changes. The
subscriber runs once with the remaining logical changes, or is not called when
every entry is unchanged. Each entry contains the logical key's `oldValue` and
`newValue`; this also normalizes Firefox events that may include unchanged keys
passed to `set()`.

Events are formatted in FIFO order for each registration, so the callback for an
earlier event is invoked before the callback for a later event. Returned callback
promises are observed for rejection but are not awaited; asynchronous callbacks
may overlap and cannot block later storage events.

Calling the returned unsubscribe function immediately removes the native
listener, clears queued events, and prevents delivery after an in-progress
format/decrypt step finishes.

Corruption or another internal formatting failure disposes that registration and
is surfaced as an uncaught asynchronous exception. There is no `onError` option,
and a `try/catch` around `watch()` or `subscribe()` cannot catch an error produced
by a later native event. User callback throws and promise rejections are also
surfaced as uncaught asynchronous exceptions, but they do not dispose the
registration; other key handlers and later events continue to run.

For `SecureStorage`, one corrupted matching entry in a multi-key native event
rejects the whole logical event: valid sibling changes from the same provider
scope are not delivered partially, the registration is disposed, and its queued
events are discarded. This includes an unwatched sibling key in the same area
and namespace; entries from another namespace are filtered out first. The
failure is scoped to that `watch()` or `subscribe()` registration; separately
registered listeners process matching entries independently and can fail in the
same way.

In a persistent MV2 background page, an internally failed registration remains
disposed until the page reloads. An MV3 service worker registers it again after a
later wake-up, so repeating corrupted input can produce a visible crash loop
instead of a permanently silent listener.

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

- `get(key | keys)`
- `getAll()`
- `set(key, value)` or `set(values)`
- `update(key | keys, updater, options?)`
- `remove(key | keys, options?)`
- `clear(options?)`
- `watch(callback | handlers)`
- `subscribe(callback)`

## Custom locking

Storage providers use the exported `WebLockManager` by default. It coordinates
updates through the native Web Locks API.

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
- the object form of `set()` uses at most one native write operation, but total,
  per-item, and item-count quotas are unchanged; a mixed batch `update()`
  set-and-delete patch uses two native write operations
