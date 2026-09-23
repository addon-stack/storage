import {fixImportsPlugin} from "esbuild-fix-imports-plugin";
import {defineConfig} from "tsup";

export default defineConfig({
    entry: [
        "src/**/*.ts",
        "!src/types.ts",
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
