import {builtinModules} from "node:module";
import path from "node:path";
import {fileURLToPath} from "node:url";

import simpleImportSort from "eslint-plugin-simple-import-sort";

const sortImports = simpleImportSort.rules.imports;
const rootTypes = fileURLToPath(new URL("../../src/types", import.meta.url));
const escapePattern = value => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const builtins = builtinModules.map(escapePattern).join("|");
const moduleEnding = "(?:\\.[cm]?[jt]sx?)?\\u0000?$";

export default {
    ...sortImports,
    meta: {...sortImports.meta, schema: []},
    create(context) {
        let rootTypesImport = path.relative(path.dirname(context.physicalFilename), rootTypes).split(path.sep).join("/");

        if (!rootTypesImport.startsWith(".")) {
            rootTypesImport = `./${rootTypesImport}`;
        }

        // simple-import-sort matches the longest pattern. It marks side effects with a leading
        // NUL and type-only imports with a trailing NUL; both follow their source module's group.
        const groups = [
            // Node.js builtins, with or without the node: prefix.
            [`^\\u0000?(?:node:|(?:${builtins})\\u0000?$)`],
            // React and React DOM, including their subpaths.
            ["^\\u0000?react(?:-dom)?(?=/|\\u0000?$)"],
            // Other external packages.
            ["^\\u0000?@?\\w"],
            // Dependencies in the current directory.
            ["^\\u0000?\\.(?:/|\\u0000?$)"],
            // Other internal dependencies.
            ["^"],
            // Local types. In src itself, ./types belongs to the root types group below.
            [rootTypesImport === "./types" ? "(?!)" : `^\\u0000?\\./types${moduleEnding}`],
            // Root src/types, relative to the file being linted.
            [`^\\u0000?${escapePattern(rootTypesImport)}${moduleEnding}`],
            // Styles and assets, including query strings such as ?url.
            ["^\\u0000?.+\\.(?:css|less|sass|scss|styl|svg|png|jpe?g|gif|webp|avif|ico|woff2?|ttf|otf|eot|mp3|mp4|webm|wav|ogg)(?:\\?[^\\u0000]*)?\\u0000?$"],
        ];

        // Delegate sorting, comment handling and fixes to the upstream rule.
        return sortImports.create(Object.create(context, {options: {value: [{groups}]}}));
    },
};
