import {planBatchUpdate} from "./batch";

interface BatchState {
    count?: number;
    label?: string;
    settings?: {enabled: boolean};
    missing?: string;
    "__proto__"?: string;
    constructor?: string;
    toString?: string;
    valueOf?: string;
}

describe("planBatchUpdate", () => {
    test("plans changed values while preserving omitted and deeply equal keys", () => {
        const previous = {
            count: 1,
            label: "before",
            settings: {enabled: true},
        };
        const patch = {
            count: 1,
            label: "after",
        };

        const plan = planBatchUpdate<BatchState, "count" | "label" | "settings">(
            ["count", "label", "settings"],
            previous,
            patch
        );

        expect(plan).toEqual({
            next: {
                count: 1,
                label: "after",
                settings: {enabled: true},
            },
            valuesToSet: {label: "after"},
            keysToRemove: [],
        });
        expect(previous).toEqual({
            count: 1,
            label: "before",
            settings: {enabled: true},
        });
        expect(patch).toEqual({count: 1, label: "after"});
    });

    test("removes an existing key without scheduling removal for an absent key", () => {
        const previous: Partial<Pick<BatchState, "label" | "missing">> = {label: "stored"};
        const patch: Partial<Pick<BatchState, "label" | "missing">> = {
            label: undefined,
            missing: undefined,
        };

        const plan = planBatchUpdate<BatchState, "label" | "missing">(
            ["label", "missing"],
            previous,
            patch
        );

        expect(plan).toEqual({
            next: {},
            valuesToSet: {},
            keysToRemove: ["label"],
        });
        expect(previous).toEqual({label: "stored"});
        expect(Object.keys(patch)).toEqual(["label", "missing"]);
    });

    test("uses own per-key comparers to skip or force writes", () => {
        const countComparer = jest.fn(() => true);
        const labelComparer = jest.fn(() => false);

        const plan = planBatchUpdate<BatchState, "count" | "label">(
            ["count", "label"],
            {count: 1, label: "same"},
            {count: 2, label: "same"},
            {count: countComparer, label: labelComparer}
        );

        expect(countComparer).toHaveBeenCalledWith(1, 2);
        expect(labelComparer).toHaveBeenCalledWith("same", "same");
        expect(plan).toEqual({
            next: {count: 1, label: "same"},
            valuesToSet: {label: "same"},
            keysToRemove: [],
        });
    });

    test("ignores inherited comparer functions", () => {
        const inheritedComparer = jest.fn(() => true);
        const compare = Object.create({count: inheritedComparer});

        const plan = planBatchUpdate<BatchState, "count">(["count"], {count: 1}, {count: 2}, compare);

        expect(inheritedComparer).not.toHaveBeenCalled();
        expect(plan).toEqual({
            next: {count: 2},
            valuesToSet: {count: 2},
            keysToRemove: [],
        });
    });

    test.each([null, [], "patch", 42, new Date()])("rejects a non-plain-object patch %#", patch => {
        expect(() => planBatchUpdate<BatchState, "count">(["count"], {count: 1}, patch as never)).toThrow(
            new TypeError("Storage batch updater must return an object patch.")
        );
    });

    test("rejects an own patch key outside the selected keys", () => {
        expect(() =>
            planBatchUpdate<BatchState, "count">(["count"], {count: 1}, {label: "unexpected"} as never)
        ).toThrow('Storage batch updater returned an unrequested key: "label".');
    });

    test("preserves prototype-like keys as own data properties without changing object prototypes", () => {
        type PrototypeKey = "__proto__" | "constructor" | "toString" | "valueOf";
        const keys: readonly PrototypeKey[] = ["__proto__", "constructor", "toString", "valueOf"];
        const previous = Object.create(null) as Partial<Pick<BatchState, PrototypeKey>>;
        const patch = Object.create(null) as Partial<Pick<BatchState, PrototypeKey>>;

        for (const key of keys) {
            Object.defineProperty(previous, key, {
                configurable: true,
                enumerable: true,
                value: `old-${key}`,
                writable: true,
            });
            Object.defineProperty(patch, key, {
                configurable: true,
                enumerable: true,
                value: `new-${key}`,
                writable: true,
            });
        }

        const plan = planBatchUpdate<BatchState, PrototypeKey>(keys, previous, patch, {});

        expect(Object.getPrototypeOf(plan.next)).toBe(Object.prototype);
        expect(Object.getPrototypeOf(plan.valuesToSet)).toBe(Object.prototype);

        for (const key of keys) {
            expect(Object.getOwnPropertyDescriptor(plan.next, key)?.value).toBe(`new-${key}`);
            expect(Object.getOwnPropertyDescriptor(plan.valuesToSet, key)?.value).toBe(`new-${key}`);
        }
    });

    test("returns an empty plan for an empty key set", () => {
        expect(planBatchUpdate<BatchState, never>([], {}, {})).toEqual({
            next: {},
            valuesToSet: {},
            keysToRemove: [],
        });
    });
});
