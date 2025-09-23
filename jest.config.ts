import type {Config} from "jest";

export default {
    testEnvironment: "jsdom",
    setupFiles: ["<rootDir>/tests/jest.setup.ts"],
    testPathIgnorePatterns: ["/node_modules/", "/dist/"],
    extensionsToTreatAsEsm: [".ts", ".tsx"],
    transform: {
        "^.+\\.(ts|tsx)$": [
            "@swc/jest",
            {
                jsc: {
                    parser: { syntax: "typescript", tsx: true },
                    target: "es2022",
                    transform: { react: { runtime: "automatic" } }
                },
                module: { type: "commonjs" }
            }
        ],
    },
    moduleNameMapper: {
        "^(\\.{1,2}/.*)\\.js$": "$1",
    },
} satisfies Config;
