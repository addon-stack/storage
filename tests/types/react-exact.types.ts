import type {UseStorageBatchReturnValue} from "~/adapters/react/types";

import type {StorageBatchPatch, StorageBatchUpdater} from "~/types";

type State = {count: number; theme?: "light" | "dark"; language: string};

// Both required and optional schema fields can be explicitly removed by update().
const patch: StorageBatchPatch<State, "count" | "theme"> = {count: undefined, theme: undefined};
const updater: StorageBatchUpdater<State, "count" | "theme"> = () => patch;
void updater;

function verifyExactOptionalProperties(hook: UseStorageBatchReturnValue<State, "count" | "theme">) {
    void hook.update(() => ({count: undefined, theme: undefined}));
    void hook.update(async () => ({count: undefined}));
    void hook.update(previous => ({count: (previous.count ?? 0) + 1}));
    void hook.set({count: 1});
    // @ts-expect-error set cannot delete a required field
    void hook.set({count: undefined});
    // @ts-expect-error set cannot delete an optional field
    void hook.set({theme: undefined});
    // @ts-expect-error update cannot modify an unselected key
    void hook.update(() => ({count: 1, language: "en"}));
}

void verifyExactOptionalProperties;
