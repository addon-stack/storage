import {hasOwn, invokeCallback} from "./utils";
import type {StorageState, StorageSubscriber, StorageWatchOptions} from "./types";

/**
 * Projects a `subscribe()` change map onto the per-key `watch()` contract.
 *
 * A watcher error is routed through `invokeCallback`, so it never blocks the
 * remaining keys of the same event. Disposal is checked before every key
 * handler, which lets a handler unsubscribe mid fan-out.
 */
export const watchChanges = <T extends StorageState>(
    subscribe: (callback: StorageSubscriber<T>) => () => void,
    watcher: StorageWatchOptions<T>
): (() => void) => {
    let disposed = false;

    const unsubscribe = subscribe(changes => {
        for (const key of Object.keys(changes) as (keyof T)[]) {
            if (disposed) {
                break;
            }

            const change = changes[key];

            if (!change) {
                continue;
            }

            if (typeof watcher === "function") {
                invokeCallback(() => watcher(change.newValue, change.oldValue, key));
                continue;
            }

            invokeCallback(() => {
                const callback = hasOwn(watcher, key) ? watcher[key] : undefined;

                if (typeof callback === "function") {
                    return callback(change.newValue, change.oldValue);
                }
            });
        }
    });

    return () => {
        if (disposed) {
            return;
        }

        disposed = true;
        unsubscribe();
    };
};
