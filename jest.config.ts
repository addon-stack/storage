import type {Config} from "jest";

export default {
    testEnvironment: "jsdom",
    setupFiles: ["<rootDir>/tests/jest.setup.ts"],
    testPathIgnorePatterns: ["/node_modules/", "/dist/"],
    preset: "ts-jest/presets/default-esm",
    extensionsToTreatAsEsm: [".ts", ".tsx"],
    transform: {
        "^.+\\.(ts|tsx)$": [
            "ts-jest",
            {
                useESM: true,
                tsconfig: "tsconfig.json",
            },
        ],
    },
    moduleNameMapper: {
        "^(\\.{1,2}/.*)\\.js$": "$1",
    },
} satisfies Config;
