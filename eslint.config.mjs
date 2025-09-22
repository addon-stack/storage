import js from "@eslint/js";
import globals from "globals";
import ts from "typescript-eslint";

export default [
    {ignores: ["dist/", ".rslib/", "tests/", "src/**/*.test.{ts,tsx,js,jsx}"]},
    {languageOptions: {globals: globals.browser}},
    js.configs.recommended,
    ...ts.configs.recommended,
    {
        rules: {
            "@typescript-eslint/no-explicit-any": "off",
        },
    },
];
