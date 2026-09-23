import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {dirname, join} from "node:path";
import {fileURLToPath} from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const temporary = mkdtempSync(join(tmpdir(), "addon-storage-consumer-"));
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const readJson = path => JSON.parse(readFileSync(path, "utf8"));
const installedVersion = name => readJson(join(root, "node_modules", name, "package.json")).version;

const runNpm = (args, cwd, capture = false) =>
    execFileSync(npm, args, {
        cwd,
        env: {...process.env, npm_config_cache: join(temporary, "npm-cache")},
        shell: process.platform === "win32",
        encoding: "utf8",
        stdio: capture ? "pipe" : "inherit",
    });

try {
    const [{filename}] = JSON.parse(
        runNpm(["pack", "--ignore-scripts", "--json", "--pack-destination", temporary], root, true)
    );

    const archive = join(temporary, filename);
    const current = installedVersion("typescript");
    const minimum = process.env.STORAGE_TEST_MIN_TYPESCRIPT ?? "5.4.5";

    const fixtures = ["react.types.ts", "react-exact.types.ts"].map(file =>
        readFileSync(join(root, "tests", file), "utf8")
            .replaceAll('"../src/adapters/react/types"', '"@addon-core/storage/react"')
            .replaceAll('"../src/adapters/react"', '"@addon-core/storage/react"')
            .replaceAll('"../src/types"', '"@addon-core/storage"')
            .replaceAll('"../src"', '"@addon-core/storage"')
    );

    for (const react of ["18", "19"]) {
        const consumer = join(temporary, `react-${react}`);
        mkdirSync(consumer);

        writeFileSync(
            join(consumer, "package.json"),
            JSON.stringify({
                name: "storage-consumer-types",
                private: true,
                type: "module",
                dependencies: {
                    "@addon-core/storage": `file:${archive}`,
                    "@types/chrome": readJson(join(root, "node_modules/@addon-core/browser/package.json")).dependencies[
                        "@types/chrome"
                    ],
                    react: react === "19" ? installedVersion("react") : "18.3.1",
                    "react-dom": react === "19" ? installedVersion("react-dom") : "18.3.1",
                    "@types/react": react === "19" ? installedVersion("@types/react") : "^18.3.0",
                    "@types/react-dom": react === "19" ? installedVersion("@types/react-dom") : "^18.3.0",
                    "typescript-minimum": `npm:typescript@${minimum}`,
                    typescript: current,
                },
            })
        );

        fixtures.forEach((source, index) => {
            writeFileSync(join(consumer, `react-${index}.ts`), source);
        });

        writeFileSync(
            join(consumer, "tsconfig.json"),
            JSON.stringify({
                compilerOptions: {
                    strict: true,
                    exactOptionalPropertyTypes: true,
                    skipLibCheck: false,
                    noEmit: true,
                    target: "ES2022",
                    module: "NodeNext",
                    moduleResolution: "NodeNext",
                    types: ["chrome"],
                },
                files: ["react-0.ts", "react-1.ts"],
            })
        );

        runNpm(["install", "--ignore-scripts", "--no-audit", "--no-fund", "--no-package-lock"], consumer);
        const published = readJson(join(consumer, "node_modules/@addon-core/storage/package.json"));
        assert.equal(published.peerDependenciesMeta.typescript.optional, true);

        for (const compiler of ["typescript-minimum", "typescript"]) {
            const compilerRoot = join(consumer, "node_modules", compiler);
            const version = readJson(join(compilerRoot, "package.json")).version;

            execFileSync(process.execPath, [join(compilerRoot, "bin/tsc"), "--project", consumer, "--noEmit"], {
                stdio: "inherit",
            });

            console.log(`Consumer declarations passed: TypeScript ${version}, React ${react}`);
        }
    }
} finally {
    rmSync(temporary, {recursive: true, force: true});
}
