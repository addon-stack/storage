import {defineConfig} from "@rslib/core";

export default defineConfig({
    source: {
        entry: {
            index: "./src/index.ts",
            react: "./src/adapters/react/index.ts",
        },
        tsconfigPath: "./tsconfig.json",
        exclude: [/\.(test|spec)\.[cm]?[jt]sx?$/, /[\\/]__tests__[\\/]/, /[\\/]tests[\\/]/],
    },
    output: {
        target: "web",
        externals: {
            react: "react",
            "react-dom": "react-dom",
        },
    },
    lib: [
        {
            format: "esm",
            syntax: "es2020",
            dts: {bundle: true, autoExtension: true},
        },
        {
            format: "cjs",
            syntax: "es2020",
            dts: false,
        },
    ],
});
