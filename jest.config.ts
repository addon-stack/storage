import type {Config} from "jest";

const common: Config = {
    rootDir: ".",
    transform: {
        "^.+\\.(ts|tsx)$": ["@swc/jest", {
            jsc: {
                parser: {syntax: "typescript", tsx: true},
                target: "es2022",
                transform: {react: {runtime: "automatic"}},
            },
            module: {type: "commonjs"},
        }],
    },
    moduleNameMapper: {
        "^~$": "<rootDir>/src/index.ts",
        "^~/(.*)$": "<rootDir>/src/$1",
        "^@tests/(.*)$": "<rootDir>/tests/$1",
        "^(\\.{1,2}/.*)\\.js$": "$1",
    },
};

const integration: Config = {
    ...common,
    setupFiles: ["<rootDir>/tests/setup/browser.ts", "<rootDir>/tests/setup/platform.ts"],
    setupFilesAfterEnv: ["<rootDir>/tests/setup/lifecycle.ts", "<rootDir>/tests/setup/storage.ts"],
};

export default {
    collectCoverageFrom: ["src/**/*.ts", "!src/**/index.ts", "!src/types.ts", "!src/**/types.ts"],
    projects: [
        {
            ...common,
            displayName: "unit",
            testEnvironment: "node",
            testMatch: ["<rootDir>/tests/unit/**/*.test.ts"],
            setupFiles: ["<rootDir>/tests/setup/platform.ts"],
            setupFilesAfterEnv: ["<rootDir>/tests/setup/lifecycle.ts"],
        },
        {
            ...integration,
            displayName: "integration",
            testEnvironment: "node",
            testMatch: ["<rootDir>/tests/integration/**/*.test.ts"],
            testPathIgnorePatterns: ["/adapters/react/"],
        },
        {
            ...integration,
            displayName: "react",
            testEnvironment: "jsdom",
            testMatch: ["<rootDir>/tests/integration/adapters/react/**/*.test.ts"],
            setupFilesAfterEnv: [...integration.setupFilesAfterEnv!, "<rootDir>/tests/setup/react.ts"],
        },
    ],
} satisfies Config;
