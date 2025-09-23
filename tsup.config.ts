import {defineConfig} from "tsup";
import {fixImportsPlugin} from "esbuild-fix-imports-plugin";

export default defineConfig({
    entry: [
        "src/**/*.ts",
        "!src/types.ts",
        "!src/**/*.test.ts",
        "!src/**/*.test.tsx",
        "!src/**/*.spec.ts",
        "!src/**/*.spec.tsx",
    ],
    outDir: "dist",
    format: ["esm"],
    dts: true,
    sourcemap: true,
    clean: true,
    bundle: false,
    target: "es2020",
    skipNodeModulesBundle: true,
    minify: false,
    tsconfig: "./tsconfig.json",
    esbuildPlugins: [fixImportsPlugin()],
    esbuildOptions(options) {
        options.outbase = "src";
        options.platform = "browser";
    },
});
