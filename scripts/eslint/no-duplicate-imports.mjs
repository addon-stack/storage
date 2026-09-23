import importX from "eslint-plugin-import-x";

const noDuplicates = importX.rules["no-duplicates"];

export default {
    ...noDuplicates,
    create(context) {
        const listener = noDuplicates.create(context);
        const imports = [];

        return {
            ImportDeclaration(node) {
                // Explicit side-effect imports must survive even when all other imports are type-only.
                if (node.specifiers.length) {
                    imports.push(node);
                }
            },
            "Program:exit"(node) {
                // import-x 4.16.1 cannot safely add a default value import to a leading `import type`.
                // Feed value declarations first so the existing runtime import anchors the fix.
                imports.sort((left, right) => Number(left.importKind === "type") - Number(right.importKind === "type"));

                for (const declaration of imports) {
                    listener.ImportDeclaration(declaration);
                }

                listener["Program:exit"](node);
            },
        };
    },
};
