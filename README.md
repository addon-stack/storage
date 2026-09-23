# @addon-core/storage

A typed, extension-first layer over `chrome.storage`.

[![npm version](https://img.shields.io/npm/v/%40addon-core%2Fstorage.svg?logo=npm&style=for-the-badge)](https://www.npmjs.com/package/@addon-core/storage)
[![npm downloads](https://img.shields.io/npm/dm/%40addon-core%2Fstorage.svg?style=for-the-badge&color=blue)](https://www.npmjs.com/package/@addon-core/storage)
[![CI](https://img.shields.io/github/actions/workflow/status/addon-stack/storage/ci.yml?style=for-the-badge)](https://github.com/addon-stack/storage/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge)](LICENSE.md)

Use concise functional helpers for one-off reads and writes, or create a reusable
provider for structured state, batch operations, lock-coordinated updates,
namespaces, encrypted values, and change subscriptions. Start without a schema
and add strict TypeScript types when your storage shape becomes stable.

## Why @addon-core/storage

Browser extension state is often shared between popups, options pages, background
workers, and other extension contexts. The native Storage API provides the
persistence layer, but leaves typing, namespacing, safe read-modify-write flows,
encryption, and logical change handling to application code.

`@addon-core/storage` keeps the native storage model while adding a consistent
API around it:

- start immediately with functional helpers and no required state interface;
- add strict key and value types without changing application code;
- use the same provider API across local, session, sync, managed, and secure storage;
- read and write multiple values through native batch operations;
- coordinate read-modify-write updates through Web Locks;
- observe individual keys with `watch()` or complete events with `subscribe()`;
- bind values to React through `@addon-core/storage/react`.

## Installation

```bash
npm i @addon-core/storage
```

TypeScript consumers require TypeScript 5.4 or newer. TypeScript is an optional
peer dependency; JavaScript consumers do not need to install it. The published
declarations are checked from an installed npm tarball with the minimum and current
compiler versions and both React 18 and React 19 types.

With pnpm or Yarn:

```bash
pnpm add @addon-core/storage
yarn add @addon-core/storage
```

## Quick start

For a one-off operation, call an area helper directly:

```ts
import {storageLocal} from "@addon-core/storage";

await storageLocal("theme", "dark");

const theme = await storageLocal<"light" | "dark">("theme");
// "light" | "dark" | undefined
```

For a series of operations, create and reuse a typed provider:

```ts
import {storageSync} from "@addon-core/storage";

interface Settings {
    language?: string;
    theme?: "light" | "dark";
}

const settings = storageSync<Settings>({
    namespace: "settings",
});

await settings.set({
    language: "uk",
    theme: "dark",
});

const values = await settings.get(["theme", "language"] as const);
// Partial<Pick<Settings, "theme" | "language">>
```

A state interface is optional. Without one, keys and values remain intentionally
loose. Add a state type when the shape stabilizes and key/value mistakes should
be caught by TypeScript.

## Choose a storage area

The storage area controls persistence, synchronization, quotas, and whether data
can be written. Prefer an area-specific helper so that intent stays visible in
the call site.

| Area | Use it for | Helper |
| --- | --- | --- |
| `local` | Persistent data on the current device | `storageLocal()` |
| `session` | Temporary state for the current browser session | `storageSession()` |
| `sync` | Small user preferences synchronized between signed-in browsers | `storageSync()` |
| `managed` | Read-only policies provided by an administrator | `storageManaged()` |

Use `local` when data does not need synchronization or session-only lifetime.
Use `sync` selectively because browser quotas are much stricter. The `managed`
area is controlled by the browser and is not writable by the extension.

The general `storage()` helper uses `local` by default and accepts an explicit
`area` when the area must be selected dynamically:

```ts
import {storage} from "@addon-core/storage";

const settings = storage<Settings>({
    area: "sync",
    namespace: "settings",
});
```

`storageSecure()` also accepts `area` because one secure helper covers all
storage areas.

## Functional API

The functional API is the recommended entry point.

### Available helpers

| Helper | Result |
| --- | --- |
| `storage()` | Plain provider; `local` by default or the supplied `area` |
| `storageLocal()` | Plain `local` provider |
| `storageSession()` | Plain `session` provider |
| `storageSync()` | Plain `sync` provider |
| `storageManaged()` | Plain `managed` provider |
| `storageSecure()` | Encrypted provider; `local` by default or the supplied `area` |

### Supported call forms

Every helper supports the same one-shot and provider forms:

```ts
storageLocal();                         // default StorageProvider
storageLocal({namespace: "settings"}); // configured StorageProvider
storageLocal("theme");                  // single get
storageLocal("theme", "dark");          // single set
storageLocal(["theme", "language"]);    // batch get
```

An object argument always means provider options. It is not interpreted as a
batch set. Create a provider for object-form writes:

```ts
const local = storageLocal<Settings>();

await local.set({
    language: "uk",
    theme: "dark",
});
```

### Typing helper calls

The meaning of the generic follows the call form.

For a single get or set, it describes the value:

```ts
const theme = await storageLocal<"light" | "dark">("theme");

await storageLocal<number>("attempts", 3);
```

For a batch get, it describes the result map:

```ts
const selected = await storageSync<{
    language?: string;
    theme?: "light" | "dark";
}>(["theme", "language"]);
```

For provider creation, it describes the complete storage state:

```ts
const settings = storageSync<Settings>({
    namespace: "settings",
});

const theme = await settings.get("theme");
// "light" | "dark" | undefined
```

Without a generic, one-shot reads use `any` and providers accept arbitrary string
keys. Runtime validation still applies: top-level `undefined` is rejected,
reserved key characters still throw, and browser serialization rules are
unchanged.

### Options and provider reuse

Common provider options are:

- `namespace` to isolate logical keys;
- `locker` to replace the default Web Locks implementation;
- `key` to group the state in one physical MonoStorage bucket;
- `area` on `storage()` and `storageSecure()`;
- `secureKey` on `storageSecure()`.

```ts
const popup = storageLocal<Settings>({
    key: "popup",
    namespace: "ui",
});
```

Every helper invocation creates a new provider. Reuse the returned provider for a
series of operations, especially when using namespaces, a custom locker, or
secure storage. Each one-shot `storageSecure()` call creates a provider and
repeats the SHA-256 digest and AES key import.

## Class API

The class API exposes the same providers and methods. Use it when class factories
fit the surrounding architecture better.

### Storage

```ts
import {Storage} from "@addon-core/storage";

const local = Storage.Local<Settings>();
const session = Storage.Session<Settings>();
const sync = Storage.Sync<Settings>({namespace: "settings"});
const managed = Storage.Managed<Settings>();
```

`Storage.make()` accepts an explicit `area`, and the constructor is available for
direct composition:

```ts
const dynamic = Storage.make<Settings>({area: "sync"});
const direct = new Storage<Settings>({area: "local"});
```

### SecureStorage

```ts
import {SecureStorage} from "@addon-core/storage";

interface AuthState {
    accessToken?: string;
    refreshToken?: string;
}

const auth = SecureStorage.Session<AuthState>({
    namespace: "auth",
    secureKey: "AppSecret",
});
```

`SecureStorage` provides the same `Local`, `Session`, `Sync`, `Managed`, and
`make` factories as `Storage`.

### MonoStorage

Pass `key` to a package factory to receive a `MonoStorage` provider backed by one
physical storage entry:

```ts
interface PopupState {
    search?: string;
    selectedTab?: "overview" | "history";
}

const popup = Storage.Local<PopupState>({
    key: "popup",
});
```

The `MonoStorage` class is also exported for custom provider composition, but the
`key` factory option is the concise path for normal use.

## Reading and writing

Every provider exposes one consistent API regardless of its area or physical
storage model.

### Read values

```ts
const theme = await settings.get("theme");
const selected = await settings.get(["theme", "language"] as const);
const all = await settings.getAll();
```

A missing single key resolves to `undefined`. Missing keys are omitted from batch
and `getAll()` results. An empty batch returns an empty object without native I/O.

### Write values

```ts
await settings.set("theme", "dark");

await settings.set({
    language: "uk",
    theme: "dark",
});
```

The object overload uses one native `storage.set()` for plain and secure storage.
`MonoStorage` performs one locked update of its physical bucket.

Both `set()` forms reject `undefined` before encryption, locking, or native I/O.
Use `remove()` or return `undefined` from an `update()` updater to delete data.
`null` remains a valid value.

The object form must be a plain object. Arrays, functions, dates, maps, and class
instances are rejected instead of being interpreted as key maps.

`set()` means “perform this write.” It does not skip a write merely because the
logical value is deeply equal. Change observers still filter logically equal
old and new values.

### Remove values

```ts
await settings.remove("language");
await settings.remove(["language", "theme"]);
await settings.clear();
```

Batch remove uses one native removal call after acquiring the relevant locks.
`clear()` removes only the physical keys owned by that provider; its exact scope
is described under [Namespaces and data scope](#namespaces-and-data-scope).

## Safe updates

Use `update()` whenever the next value depends on the previous value. A separate
`get()` followed by `set()` can lose concurrent changes made by another extension
context.

### Single-key update

```ts
interface UsageState {
    installCount?: number;
}

const usage = storageLocal<UsageState>({
    namespace: "usage",
});

const count = await usage.update(
    "installCount",
    previous => (previous ?? 0) + 1
);
```

The updater may be synchronous or asynchronous. Returning `undefined` removes the
key. By default, deeply equal results skip the physical write.

### Batch update

The array overload locks the selected keys in a stable order, reads one snapshot,
and applies one returned patch:

```ts
const next = await settings.update(
    ["theme", "language"] as const,
    previous => ({
        language: previous.language ?? "en",
        theme: previous.theme === "dark" ? "light" : "dark",
    })
);
```

A selected key omitted from the patch stays unchanged. An own patch property set
to `undefined` removes that key. Returning an unselected key throws before any
write. The resolved object is the final snapshot of the selected keys, with
missing and removed keys omitted.

### Equality comparison

A single-key comparer receives the previous and proposed values:

```ts
await settings.update(
    "theme",
    () => "dark",
    {
        compare: (previous, next) => previous === next,
    }
);
```

A batch comparer receives the complete previous and proposed snapshots and makes
one decision for the whole batch:

```ts
await settings.update(
    ["theme", "language"] as const,
    previous => ({
        language: previous.language ?? "en",
        theme: "dark",
    }),
    {
        compare: (previous, next) =>
            previous.theme === next.theme &&
            (previous.language ?? "en") === (next.language ?? "en"),
    }
);
```

Returning `true` skips the update and resolves to the previous value or snapshot.
Returning `false` applies the explicit patch, including defined patch values that
are deeply equal to their stored values. It does not guarantee a logical
notification: observers filter equal old and new values.

Without a custom batch comparer, each explicit patch value is compared deeply.
Only changed values are written, only existing requested keys are removed, and
omitted keys remain untouched.

### Lock timeout and cancellation

```ts
const controller = new AbortController();

await settings.update(
    ["theme", "language"] as const,
    previous => ({
        ...previous,
        theme: "dark",
    }),
    {
        signal: controller.signal,
        timeout: 500,
    }
);
```

`signal` and `timeout` apply while a lock request is queued. Once a lock has been
granted, aborting the signal does not cancel the running updater. For a batch,
the timeout applies to each selected lock acquisition rather than one deadline
for the entire operation.

Locks coordinate only package operations that use the same lock names. Direct
`set()` calls on plain or secure storage and raw `chrome.storage` writes do not
participate, so locking is not a database transaction.

### Mixed writes and deletions

For `Storage` and `SecureStorage`, a batch patch that both writes and deletes
requires one native `set()` followed by one native `remove()`. It can therefore
emit two native change events and invoke `subscribe()` twice. `MonoStorage`
changes one physical bucket and emits one bucket event.

If the set phase succeeds and the remove phase fails, `update()` rejects with
`StoragePartialUpdateError`. Its `appliedSetKeys` and
`attemptedRemoveKeys` contain logical keys, and `cause` preserves the native
removal error. No rollback is attempted. Extension context termination between
the two native calls can leave the same partial state without a JavaScript error.

### Custom locker

Providers use `WebLockManager` by default. Supply a `StorageLocker` when another
coordination mechanism is required:

```ts
import {storageLocal, type StorageLocker} from "@addon-core/storage";

const locker: StorageLocker = {
    async request(name, task) {
        return await task();
    },
};

const storage = storageLocal<{count?: number}>({
    locker,
    namespace: "custom-locking",
});
```

Reads do not require Web Locks. Single and batch `update()`, `remove()`,
`clear()`, and MonoStorage mutations are lock-coordinated. Direct plain and
secure `set()` calls do not acquire a lock.

## Watching changes

### Watch individual keys

`watch()` is key-oriented. A function watcher runs once for every changed
logical key:

```ts
const unsubscribe = settings.watch((next, previous, key) => {
    console.log(key, previous, "->", next);
});
```

An object watcher handles only selected keys:

```ts
const unsubscribe = settings.watch({
    theme(next, previous) {
        console.log("theme", previous, "->", next);
    },
    language(next, previous) {
        console.log("language", previous, "->", next);
    },
});
```

### Subscribe to complete events

`subscribe()` receives one logical change map for each matching package-level
event:

```ts
const unsubscribe = settings.subscribe(changes => {
    if (changes.theme) {
        console.log(
            "theme",
            changes.theme.oldValue,
            "->",
            changes.theme.newValue
        );
    }

    if (changes.language) {
        console.log(
            "language",
            changes.language.oldValue,
            "->",
            changes.language.newValue
        );
    }
});
```

| Method | Delivery |
| --- | --- |
| `watch()` | One callback per changed logical key |
| `subscribe()` | One callback with the event’s logical change map |

Both APIs filter by area, namespace, physical key shape, and deep equality.
`SecureStorage` decrypts values before delivery. `MonoStorage` expands its
physical bucket change into logical key changes. A callback is not invoked when
nothing changed logically.

### Delivery order and unsubscribe

Events are formatted in FIFO order for each registration, so an earlier event’s
callback is invoked before a later event’s callback. Returned callback promises
are observed for rejection but are not awaited; asynchronous callbacks may
overlap and cannot block later events.

The returned unsubscribe function is idempotent. It removes the native listener,
clears queued events, and prevents delivery after an in-progress format or
decrypt step finishes. A `watch()` handler can unsubscribe during a multi-key
event, preventing later handlers in the same fan-out from running.

### Error behavior

Handle expected application failures inside the callback:

```ts
const unsubscribe = settings.subscribe(async changes => {
    try {
        await sendChangesToServer(changes);
    } catch (error) {
        console.error("Could not synchronize storage changes", error);
    }
});
```

A synchronous callback throw or rejected callback promise is surfaced as an
uncaught asynchronous exception. It does not close the registration: sibling
`watch()` handlers and future events continue to run.

A corruption, decryption, or internal formatting failure is stricter. The
affected registration is disposed, its queued events are cleared, and the
current event is not delivered partially. The error is then surfaced
asynchronously. A `try/catch` around registration cannot catch an error produced
by a later native event. Separately registered listeners remain independent.

Pass `onError` to `subscribe()` or as the second argument of `watch()` to handle
terminal subscription failures. The failed registration is still disposed before
this callback runs; subscribe again after resolving the failure. Without `onError`,
the asynchronous exception behavior described above is preserved.

```ts
const unsubscribe = settings.subscribe(
    changes => console.log(changes),
    {onError: error => console.error("Subscription closed", error)},
);
```

This handler receives decoding/formatting errors, including those forwarded through
MonoStorage. It does not intercept exceptions from application change callbacks.
A throw or rejection from `onError` itself is surfaced asynchronously.


For `SecureStorage`, one corrupted matching entry in a multi-key native event
rejects that entire logical event, including valid sibling changes in the same
provider scope.

<details>
<summary>Background context behavior after an internal listener failure</summary>

In a persistent Manifest V2 background page, the failed registration stays
disposed until the page reloads. A Manifest V3 service worker registers it again
when the worker starts later. Repeated corrupted input can therefore fail again
after subsequent worker wake-ups.

</details>

## Namespaces and data scope

Use namespaces when modules may use the same logical key names:

```ts
const auth = storageLocal<{token?: string}>({
    namespace: "auth",
});

const analytics = storageLocal<{token?: string}>({
    namespace: "analytics",
});
```

The providers use different physical keys and do not observe, enumerate, or
clear each other’s values.

A plain `Storage` provider without a namespace owns every one-segment plain key
in its area. Its `getAll()` and `clear()` exclude namespaced and secure entries,
but they do include unnamespaced MonoStorage buckets. A namespaced provider owns
keys with its exact namespace, including MonoStorage buckets created in that
same scope.

MonoStorage has no extra physical tag: its bucket is an ordinary logical key in
the underlying plain or secure provider. A broad provider with the same area and
namespace can therefore enumerate or clear that bucket. The MonoStorage provider
itself reads, observes, and clears only its selected bucket.

The colon (`:`) is reserved as the physical key separator. Namespaces and
top-level logical keys used by `Storage` or `SecureStorage` cannot contain it.
The physical MonoStorage bucket `key` follows the same rule, while logical field
names inside the bucket may contain colons.

Keys that do not match a provider’s exact codec are ignored by its `getAll()`,
events, and `clear()`.

## SecureStorage

`SecureStorage` encrypts each logical value with AES-GCM before writing it to
native storage.

The recommended functional form is:

```ts
import {storageSecure} from "@addon-core/storage";

interface AuthState {
    accessToken?: string;
    refreshToken?: string;
}

const auth = storageSecure<AuthState>({
    area: "local",
    namespace: "auth",
    secureKey: "AppSecret",
});

await auth.set("accessToken", "jwt-token");
const token = await auth.get("accessToken");
```

The class factories provide the same behavior:

```ts
import {SecureStorage} from "@addon-core/storage";

const auth = SecureStorage.Local<AuthState>({
    namespace: "auth",
    secureKey: "AppSecret",
});
```

Use the same stable `secureKey` whenever the values must be decrypted later.
The provider hashes it with SHA-256 and imports the result as an AES-GCM key.
The secure key is application-provided; this package does not provide a
hardware-backed secret store.

### Physical key format

Secure keys always have three segments:

```text
secure:<namespace-or-empty>:<logical-key>
```

Examples:

```text
secure::theme
secure:auth:accessToken
```

This distinguishes unnamespaced secure data from plain
`storageLocal({namespace: "secure"})` data such as `secure:theme`. The
ciphertext format remains `iv:ciphertext`.

### Corrupted values and recovery

A present empty, non-string, or undecipherable value throws
`StorageCorruptionError`. Its `provider` and `key` identify the logical entry,
and `cause` preserves the format or decryption error.

One corrupted selected key rejects the whole batch get. One corrupted owned key
rejects `getAll()`. Reads do not silently fall back to defaults.

Known corrupted SecureStorage entries can be recovered without decrypting the
old value:

- `set()` replaces a known key;
- `remove()` deletes known keys;
- `clear()` enumerates and removes all keys owned by that secure provider.

`remove()` and `clear()` never decrypt the stored ciphertext.

## MonoStorage

`MonoStorage` groups a feature’s logical state under one physical storage key.

```ts
interface PopupState {
    filters?: string[];
    search?: string;
    selectedTab?: "overview" | "history";
}

const popup = storageLocal<PopupState>({
    key: "popup",
});

await popup.set({
    search: "open tabs",
    selectedTab: "overview",
});

await popup.update(
    "filters",
    previous => [...(previous ?? []), "pinned"]
);

const state = await popup.getAll();
```

A MonoStorage mutation is a locked read-modify-write of the bucket. Single and
batch sets perform one bucket update and write even when supplied logical values
are deeply equal. A batch update changes the physical bucket once, so one native
event becomes one logical `subscribe()` callback.

A missing bucket is treated as empty. A present non-plain-object bucket is
corrupted and throws `StorageCorruptionError` instead of being overwritten as an
empty object. Removing the last logical field removes the physical bucket.

### Corruption recovery

Recovery differs because SecureStorage stores values independently while
MonoStorage must decode its complete bucket before changing one logical field.

| Provider | `set()` | `remove()` | `clear()` |
| --- | --- | --- | --- |
| `SecureStorage` | Replaces a known ciphertext without reading it | Removes known physical entries without decrypting | Removes all owned physical entries without decrypting |
| `MonoStorage` over `Storage` | Cannot replace one field in a corrupted bucket | Cannot remove one field from a corrupted bucket | Removes the physical bucket directly |
| `MonoStorage` over `SecureStorage` | Cannot decrypt and update a corrupted bucket | Cannot decrypt and update a corrupted bucket | Removes the encrypted physical bucket without decrypting |

Use `clear()` or an exact native removal to recover a corrupted MonoStorage
bucket. Its logical `set()`, `update()`, and `remove()` operations intentionally
fail instead of coercing damaged data into a new bucket.

## React

The React 18/19 adapter is available through `@addon-core/storage/react`. `useStorage()`
accepts one options object and returns an object with data, status, and asynchronous
operations. Choose exactly one of `key` or `keys`. Use it in client-rendered extension
UI; the adapter does not provide a server snapshot.

### One key

Create a reusable provider outside the component. The hook reads it and subscribes
to changes; it does not recreate the provider on each render.

```tsx
import {storageLocal, StorageStatus} from "@addon-core/storage";
import {useStorage} from "@addon-core/storage/react";

type Settings = {
    theme: "light" | "dark";
    language: "en" | "ru";
    count: number;
};

const settings = storageLocal<Settings>({namespace: "settings"});

export function ThemeToggle() {
    const theme = useStorage({
        storage: settings,
        key: "theme",
        defaultValue: "light",
    });

    if (theme.status === StorageStatus.Loading) return <span>Loading settings…</span>;
    if (theme.status === StorageStatus.Error) return <span>Could not read settings.</span>;

    async function toggle() {
        try {
            await theme.update(previous => previous === "dark" ? "light" : "dark");
        } catch {
            // The original error is also available as theme.mutationError.
        }
    }

    return (
        <>
            <button disabled={theme.isMutating} onClick={toggle}>
                Theme: {theme.value}
            </button>
            {theme.mutationError !== undefined && <span>Could not save settings.</span>}
        </>
    );
}
```

Omit `storage` to use a shared default local provider:

```tsx
const counter = useStorage({key: "count", defaultValue: 0});
const token = useStorage<string>({key: "token"});
```

Pass a typed provider for schema-based key and value inference. The same hook works
with plain, secure, and MonoStorage providers, including their area and namespace.
Managed providers can be observed; native writes to managed storage reject.

### Selected keys

`keys` returns an object keyed by the selection, even when the array contains one
key. Defaults use the same shape. Missing keys without defaults are omitted.

```tsx
const preferences = useStorage({
    storage: settings,
    keys: ["theme", "language"],
    defaultValue: {theme: "light", language: "en"},
});

preferences.value.theme;
preferences.value.language;
preferences.exists.theme;
preferences.exists.language;
```

If only `theme: "dark"` is stored, the result is:

```ts
{
    value: {theme: "dark", language: "en"},
    exists: {theme: true, language: false},
    status: "ready",
    // ...operations and error state
}
```

Batch `set()` and `update()` apply patches: omitted fields remain unchanged. Methods
are restricted to selected keys, including runtime validation of batch patches.

```ts
await preferences.set({theme: "dark"}); // language is unchanged
await preferences.update(previous => ({
    theme: previous.theme === "dark" ? "light" : "dark",
}));
await preferences.remove(); // removes theme and language, not the namespace
await preferences.refresh();
```

An empty `keys` selection is immediately ready with empty `value` and `exists` maps.
Duplicate keys are deduplicated, and changing only their order does not restart
reading or subscriptions. Inline options and equivalent arrays are supported.

For options declared outside the call, use `satisfies` to check the schema and
`as const` to preserve literal keys:

```ts
import type {UseStorageBatchOptions, UseStorageSingleOptions} from "@addon-core/storage/react";

const themeOptions = {
    storage: settings,
    key: "theme",
} satisfies UseStorageSingleOptions<Settings>;

const preferenceKeys = ["theme", "language"] as const;
const preferenceOptions = {
    storage: settings,
    keys: preferenceKeys,
} satisfies UseStorageBatchOptions<Settings>;

const theme = useStorage(themeOptions);
const preferences = useStorage(preferenceOptions);
```

Forwarding hooks can accept `UseStorageSingleOptions<State, Key>` or
`UseStorageBatchOptions<State, Key>` and keep the corresponding result type.
`storage` is optional in both; omitted storage uses the default local provider.
Dynamic `UseStorageOptions<State, Key>` parameters return a union of the single
and batch results. An optional default does not remove `undefined` from `value`.

### Readiness and defaults

`status` uses the string enum `StorageStatus`, imported from `@addon-core/storage`:
`Loading`, `Ready`, and `Error`. The enum is shared by all framework adapters.
Its runtime values are `"loading"`, `"ready"`, and `"error"`. When a plain string
type is needed, derive it from the enum instead of declaring a separate union:

```ts
import {StorageStatus} from "@addon-core/storage";

type StatusText = `${StorageStatus}`;
```

| Situation | `value` | `status` | Single-key `exists` |
| --- | --- | --- | --- |
| Initial read is pending | Default or `undefined` | `loading` | `undefined` |
| Stored key is found | Stored value | `ready` | `true` |
| Key is absent | Default or `undefined` | `ready` | `false` |
| Initial read fails | Default or `undefined` | `error` | `undefined` |
| Stored value is `null` | `null` | `ready` | `true` |

For `keys`, `exists` contains one `boolean | undefined` per selected key. `status`
describes the selected data, not the entire storage area. A selected key can be
resolved by a storage event while the initial read is pending. `ready` means every
selected key is resolved; it does not mean every key exists or that cloud sync has
completed. A read/subscription failure produces `error`.

Defaults are display fallbacks. They are available on the first render, never
persisted automatically, and applied again after deletion. `null`, `false`, `0`,
and empty strings are stored values. Consumers sharing a provider may use different
defaults. Changing defaults does not read or write storage.
Batch `value` keeps its identity while its displayed values remain deeply equal,
including when defaults are written inline or status fields change.

The hook infers values from the provider schema. Defined defaults remove `undefined`
from the displayed single value or the corresponding batch properties; properties
without defaults can still be absent.

### Operations and errors

| Member | Contract |
| --- | --- |
| `set(value)` / `set(patch)` | Writes defined values; returns `Promise<void>` |
| `update(updater, options?)` | Delegates to the provider's single/batch update and returns its raw result |
| `remove(options?)` | Removes the selected key(s); returns `Promise<void>` |
| `refresh()` | Re-reads selected keys and reinstalls a failed subscription; returns `Promise<void>` |
| `error` | Original read or subscription error; initially `undefined` |
| `isMutating` | Whether any selected key has a pending hook mutation |
| `mutationError` | Error from the latest-started mutation for a key; cleared by the next mutation |

Updater callbacks receive actual stored values, including missing keys, without
UI defaults. Updaters can be asynchronous. `compare`, `signal`, and `timeout` are
forwarded to the provider; existing locking and partial-update guarantees apply.
Invalid batch shapes or unselected keys passed to `set()` reject before changing
mutation state or calling storage. Updater patches are checked when the callback
runs inside the provider's update operation.

In Firefox content scripts, the default Web Locks implementation can reject locked
operations with `Permission denied to access property "then"`
([Mozilla bug 1873028](https://bugzilla.mozilla.org/show_bug.cgi?id=1873028)).
This also affects direct provider calls. Perform these operations in an extension
page or background context through your application's messaging layer. The hook
exposes the original error through the returned promise and `mutationError`.

Mutations show confirmed storage data, without optimistic values or rollback.
After success, the subscription updates selected values without an additional
read. The mutation promise can resolve and `isMutating` become `false` before
the event is delivered, particularly when secure values need to be decrypted.
Use the result returned by `update()` when the caller needs its computed value;
call `refresh()` when an explicit read of the selected keys is required.

After failure, selected keys are re-read to recover actual state, including partial
batch writes. The promise rejects with the original provider error. A recovery
read failure is exposed through `error` and does not replace the mutation error.
`isMutating` includes this recovery read.
For a batch, `mutationError` is the first selected key's error in sorted key order;
separate calls can be caught independently through their returned promises.

Read failures after a successful load retain the last confirmed data. A background
refresh does not replace ready data with a loading screen. A mutation failure does
not change readiness when reconciliation succeeds. Catch returned promises in event
handlers; the hook does not swallow operation failures.

A newly mounted consumer retries failed reads for its selection and a failed shared
subscription. A mutation also retries an already failed subscription before calling
the provider. Reconnecting re-reads retained keys that may have missed events;
overlapping consumers share a pending retry. Recovery failures are reported through
`error` and do not replace the mutation's result. There is no automatic retry loop:
another mount, mutation, or explicit `refresh()` can retry a failed subscription.

Multiple consumers of the same provider share a subscription and in-flight reads
for overlapping keys. Events update a selected batch together. A mixed native
set/remove update can still produce two events; it is not a database transaction.
Different provider instances have separate caches. After the final consumer and
pending mutation release a key, its cache is discarded. Subscription cleanup is
deferred by one microtask to handle React StrictMode setup/cleanup pairs.

Switching a provider or selection observes the new source and ignores stale reads
from the previous source. A cached resolved key can be ready immediately. Treat
returned values as immutable; write through the methods instead of mutating snapshots.

## API reference

### Provider methods

Every `StorageProvider` exposes:

| Method | Purpose |
| --- | --- |
| `get(key)` | Read one value |
| `get(keys)` | Read selected values in one batch |
| `getAll()` | Read every logical value owned by the provider |
| `set(key, value)` | Write one value |
| `set(values)` | Write a plain-object batch |
| `update(key, updater, options?)` | Lock and update one value |
| `update(keys, updater, options?)` | Lock and update a selected snapshot |
| `remove(key \| keys, options?)` | Remove one or several values |
| `clear(options?)` | Remove every value owned by the provider |
| `watch(callback \| handlers, {onError}?)` | Observe changes per logical key |
| `subscribe(callback, options?)` | Observe one logical change map per event |

### Public errors

| Error | Meaning |
| --- | --- |
| `StorageCorruptionError` | A stored secure value or MonoStorage bucket cannot be decoded safely |
| `StoragePartialUpdateError` | A mixed plain/secure batch update wrote values but failed during removal |

## Requirements and limits

- `chrome.storage` must be available in the extension context.
- Web Locks are required for lock-coordinated operations unless a custom
  `StorageLocker` is supplied.
- `SecureStorage` requires the Web Crypto API.
- Native browser serialization behavior still applies.
- Native storage quotas still apply, especially to the `sync` area.
- An object-form `set()` uses at most one native set operation, but does not
  bypass total, per-item, item-count, or write-rate quotas.
- A mixed plain or secure batch update uses two native mutation calls.
- `managed` storage is browser-controlled and read-only. A mutation rejects when
  it reaches native storage, while a package-level no-op may resolve without a
  native call.

## License

[MIT](LICENSE.md)
