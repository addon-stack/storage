import {fileURLToPath} from "node:url";

import {describe, expect, test} from "@jest/globals";
import {ESLint} from "eslint";

import config from "../../eslint.config.js";

const cwd = fileURLToPath(new URL("../../", import.meta.url));
const checker = new ESLint({cwd, overrideConfigFile: true, overrideConfig: config});
const fixer = new ESLint({cwd, fix: true, overrideConfigFile: true, overrideConfig: config});
const filePath = "src/import-example.ts";

describe("import groups", () => {
    test("orders all eight groups and keeps mixed imports in their module's group", async () => {
        const groups = [
            'import {join} from "node:path";',
            'import {type ReactNode, useMemo} from "react";',
            'import {dequal} from "dequal/lite";',
            'import {createObserver} from "./create-observer";',
            'import Storage from "../providers/Storage";\nimport {createRecord} from "../utils";',
            'import {type StorageObserverSnapshot, StorageStatus} from "./types";',
            'import type {StorageState} from "../types";',
            'import "./styles.css";\nimport logo from "../logo.svg?url";',
        ];

        const usage = "export type Types = [ReactNode, StorageObserverSnapshot, StorageState];\nexport const values = [join, useMemo, dequal, createObserver, Storage, createRecord, StorageStatus, logo];";
        const source = `${[...groups].reverse().join("\n").replace('import {type StorageObserverSnapshot, StorageStatus} from "./types";', 'import type {StorageObserverSnapshot} from "./types";\nimport {StorageStatus} from "./types";')}\n\n${usage}\n`;
        const expected = `${groups.join("\n\n")}\n\n${usage}\n`;
        const filePath = "src/observer/import-example.ts";
        const [checked] = await checker.lintText(source, {filePath});
        expect(checked.messages.some(message => message.ruleId === "project/import-order")).toBe(true);
        expect(checked.output).toBeUndefined();

        const [fixed] = await fixer.lintText(source, {filePath});
        expect(fixed.messages).toEqual([]);
        expect(fixed.output).toBe(expected);

        const [again] = await fixer.lintText(expected, {filePath});
        expect(again.messages).toEqual([]);
        expect(again.output).toBeUndefined();
    });

    test.each([
        ["src/observer/import-example.ts", "../types", "../shared/types"],
        ["src/adapters/react/import-example.ts", "../../types", "../types"],
        ["src/nested/deep/module/import-example.ts", "../../../types", "../../types"],
        ["tests/import-example.ts", "../src/types", "../types"],
        ["tests/nested/import-example.ts", "../../src/types.js", "../types"],
    ])("recognizes root types from %s without treating other types modules as root", async (filePath, rootImport, otherImport) => {
        const usage = "export type Types = [Root, Local, Other];\nexport const value = create;";
        const source = `import type {Root} from "${rootImport}";\nimport type {Local} from "./types";\nimport type {Other} from "${otherImport}";\nimport {create} from "./create";\n\n${usage}\n`;
        const expected = `import {create} from "./create";\n\nimport type {Other} from "${otherImport}";\n\nimport type {Local} from "./types";\n\nimport type {Root} from "${rootImport}";\n\n${usage}\n`;
        const [fixed] = await fixer.lintText(source, {filePath});
        expect(fixed.messages).toEqual([]);
        expect(fixed.output).toBe(expected);

        const [again] = await fixer.lintText(expected, {filePath});
        expect(again.messages).toEqual([]);
        expect(again.output).toBeUndefined();
    });

    test("places ./types last among code imports for files in src itself", async () => {
        const source = 'import {type State, Status} from "./types";\nimport type {Observer} from "./observer/types";\nimport {helper} from "../tests/helpers/async";\nimport "./styles.css";\n\nexport type Types = [State, Observer];\nexport const values = [Status, helper];\n';
        const expected = 'import type {Observer} from "./observer/types";\n\nimport {helper} from "../tests/helpers/async";\n\nimport {type State, Status} from "./types";\n\nimport "./styles.css";\n\nexport type Types = [State, Observer];\nexport const values = [Status, helper];\n';
        const [fixed] = await fixer.lintText(source, {filePath});
        expect(fixed.messages).toEqual([]);
        expect(fixed.output).toBe(expected);
    });

    test("groups bare Node builtins and React subpaths ahead of similarly named external packages", async () => {
        const source = 'import {form} from "react-hook-form";\nimport {jsx} from "react/jsx-runtime";\nimport {createRoot} from "react-dom/client";\nimport {readFile} from "fs/promises";\nimport {join} from "node:path";\nimport {browserPath} from "path-browserify";\n\nexport const values = [form, jsx, createRoot, readFile, join, browserPath];\n';
        const [fixed] = await fixer.lintText(source, {filePath});
        expect(fixed.messages).toEqual([]);

        const groups = fixed.output.split("\n\n");
        expect(groups).toHaveLength(4);
        expect(groups[0].split("\n")).toEqual(['import {readFile} from "fs/promises";', 'import {join} from "node:path";']);
        expect(groups[1].split("\n")).toEqual(expect.arrayContaining(['import {jsx} from "react/jsx-runtime";', 'import {createRoot} from "react-dom/client";']));
        expect(groups[2].split("\n")).toEqual(['import {browserPath} from "path-browserify";', 'import {form} from "react-hook-form";']);
    });

    test("keeps side-effect order within a group and sends package styles to the asset group", async () => {
        const source = 'import "./z.scss";\nimport "./a.css";\nimport "react/style.css";\nimport "z-polyfill";\nimport "a-polyfill";\nimport "./setup";\n';
        const expected = 'import "z-polyfill";\nimport "a-polyfill";\n\nimport "./setup";\n\nimport "./z.scss";\nimport "./a.css";\nimport "react/style.css";\n';
        const [fixed] = await fixer.lintText(source, {filePath});
        expect(fixed.messages).toEqual([]);
        expect(fixed.output).toBe(expected);
    });
});

describe("imports from one module", () => {
    test.each([
        [
            "enum and named types",
            'import type {StorageObserverDriver, StorageObserverScope, StorageObserverSnapshot} from "./types";\nimport {StorageStatus} from "./types";',
            "export type Types = [StorageObserverDriver, StorageObserverScope, StorageObserverSnapshot];\nexport const status = StorageStatus.Ready;",
            'import {type StorageObserverDriver, type StorageObserverScope, type StorageObserverSnapshot, StorageStatus} from "./types";',
        ],
        [
            "functions, constants and aliased types",
            'import type {Options as ReadOptions} from "./api";\nimport {read} from "./api";\nimport {DEFAULT_LIMIT as limit} from "./api";',
            "export const run = (options: ReadOptions) => read(options, limit);",
            'import {DEFAULT_LIMIT as limit, type Options as ReadOptions, read} from "./api";',
        ],
        [
            "default class before types",
            'import Client from "./client";\nimport type {Options} from "./client";',
            "export const create = (options: Options) => new Client(options);",
            'import Client, {type Options} from "./client";',
        ],
        [
            "default class after types",
            'import type {Options} from "./client";\nimport Client from "./client";',
            "export const create = (options: Options) => new Client(options);",
            'import Client, {type Options} from "./client";',
        ],
        [
            "existing inline types and additional values",
            'import {type Options, read} from "./api";\nimport {write} from "./api";',
            "export const run = (options: Options) => write(read(options));",
            'import {type Options, read, write} from "./api";',
        ],
        [
            "type-only declarations without adding a runtime import",
            'import type {A} from "./types";\nimport type {B} from "./types";',
            "export type Both = [A, B];",
            'import type {A, B} from "./types";',
        ],
    ])("combines %s and stays stable on a second pass", async (_label, imports, usage, expectedImport) => {
        const source = `${imports}\n\n${usage}\n`;
        const [checked] = await checker.lintText(source, {filePath});
        expect(checked.messages.some(message => message.ruleId === "project/no-duplicate-imports")).toBe(true);
        expect(checked.output).toBeUndefined();

        const [fixed] = await fixer.lintText(source, {filePath});
        expect(fixed.messages).toEqual([]);
        expect(fixed.output).toBe(`${expectedImport}\n\n${usage}\n`);

        const [again] = await fixer.lintText(fixed.output, {filePath});
        expect(again.messages).toEqual([]);
        expect(again.output).toBeUndefined();
    });

    test("also combines ordinary JavaScript value imports", async () => {
        const source = 'import {read} from "./api";\nimport {write} from "./api";\nexport const run = () => write(read());\n';
        const [result] = await fixer.lintText(source, {filePath: "src/import-example.js"});
        expect(result.messages).toEqual([]);
        expect(result.output).toBe('import {read, write} from "./api";\n\nexport const run = () => write(read());\n');
    });

    test("preserves explicit side effects alongside type-only imports", async () => {
        const source = 'import "./types";\nimport type {A} from "./types";\nimport type {B} from "./types";\nexport type Both = [A, B];\n';
        const [result] = await fixer.lintText(source, {filePath});
        expect(result.messages).toEqual([]);
        expect(result.output).toBe('import "./types";\nimport type {A, B} from "./types";\n\nexport type Both = [A, B];\n');
    });

    test("keeps distinct module query strings separate", async () => {
        const source = 'import {value as first} from "./module?first";\nimport {value as second} from "./module?second";\n\nexport const values = [first, second];\n';
        const [result] = await fixer.lintText(source, {filePath});
        expect(result.messages).toEqual([]);
        expect(result.output).toBeUndefined();
    });

    test("reports duplicate imports with attached comments without deleting those comments", async () => {
        const source = 'import type {Options} from "./api";\n// Used by callers at runtime.\nimport {read} from "./api";\nexport const run = (options: Options) => read(options);\n';
        const [result] = await fixer.lintText(source, {filePath});
        expect(result.messages.some(message => message.ruleId === "project/no-duplicate-imports")).toBe(true);
        expect(result.messages.every(message => message.ruleId !== null)).toBe(true);
        expect(result.output ?? source).toContain("// Used by callers at runtime.");
    });
});
