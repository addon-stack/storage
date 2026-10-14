import {spawnSync} from "node:child_process";
import {mkdtempSync, readFileSync, rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {text} from "node:stream/consumers";
import {fileURLToPath} from "node:url";

import conventionalCommitConfig from "@commitlint/config-conventional";
import {expect, test} from "@jest/globals";
import {ConventionalChangelog} from "conventional-changelog";
import {CommitParser} from "conventional-commits-parser";

import createReleaseConfig from "../../.release-it.cjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const renovate = JSON.parse(readFileSync(join(root, "renovate.json"), "utf8"));
const commitlint = JSON.parse(readFileSync(join(root, ".commitlintrc.json"), "utf8"));
const release = createReleaseConfig();
const changelogOptions = release.plugins["@release-it/conventional-changelog"];
const parse = message => new CommitParser(changelogOptions.parserOpts).parse(message);
const scope = renovate.semanticCommitScope ? `(${renovate.semanticCommitScope})` : "";
const updateMessage = `${renovate.semanticCommitType}${scope}: update dependencies`;

const lint = message => spawnSync(process.execPath, [join(root, "node_modules/@commitlint/cli/cli.js"), "--strict"], {
    cwd: root,
    input: message,
    encoding: "utf8",
    timeout: 10000,
});

test("Renovate's dependency commit passes commitlint and triggers a patch release", () => {
    expect(updateMessage).toBe("deps: update dependencies");
    const result = lint(updateMessage);
    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
    expect(changelogOptions.whatBump([parse(updateMessage)], "0.8.2")).toEqual({level: 2});
});

test("commitlint preserves conventional types and rejects unknown types", () => {
    expect(commitlint.rules["type-enum"][2]).toEqual(expect.arrayContaining(conventionalCommitConfig.rules["type-enum"][2]));
    const result = lint("depz: update dependencies");
    expect(result.status).not.toBe(0);
    expect(result.stdout).toContain("type-enum");
});

test.each([
    ["deps(chrome): update chrome types", "0.8.2", 2],
    ["deps(chrome): update chrome types", "1.2.3", 2],
    ["deps!: require Chrome 140", "0.8.2", 1],
    ["deps!: require Chrome 140", "1.2.3", 0],
    ["deps: update browser\n\nBREAKING CHANGE: require Chrome 140", "1.2.3", 0],
])("applies release policy to %s at version %s", (message, version, level) => {
    expect(changelogOptions.whatBump([parse(message)], version)).toEqual({level});
});

test("renders dependency updates in Dependencies in the changelog and GitHub release notes", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "storage-dependency-release-"));
    // Keep parent Git hooks and signing settings out of this isolated history.
    const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_")));

    const git = (...args) => {
        const result = spawnSync("git", [
            "-c", `core.hooksPath=${join(cwd, "no-hooks")}`,
            "-c", "commit.gpgSign=false",
            "-c", "tag.gpgSign=false",
            "-c", "user.name=Release Test",
            "-c", "user.email=release-test@example.invalid",
            ...args,
        ], {cwd, env, encoding: "utf8", timeout: 10000});

        if (result.status !== 0) {
            throw new Error(`Fixture git ${args[0]} failed: ${result.error?.message ?? result.stderr}`);
        }
    };

    try {
        git("init", "--quiet");
        git("commit", "--allow-empty", "-m", "chore: initial release");
        git("tag", "v0.8.2");
        git("commit", "--allow-empty", "-m", updateMessage);
        git("commit", "--allow-empty", "-m", "deps(chrome): update chrome types");
        git("commit", "--allow-empty", "-m", "fix(storage): fix stale values");

        const changelog = await text(new ConventionalChangelog(cwd)
            .loadPreset(changelogOptions.preset)
            .context({...changelogOptions.context, version: "0.8.3", contributors: []})
            .commits({from: "v0.8.2"}, changelogOptions.parserOpts)
            .writer(changelogOptions.writerOpts)
            .writeStream());

        const sections = changelog.split(/^### /m);
        const dependencies = sections.find(section => section.startsWith("📦 Dependencies\n"));
        const fixes = sections.find(section => section.startsWith("🐛 Bug Fixed\n"));
        expect(dependencies).toContain("update dependencies");
        expect(dependencies).toContain("**chrome:** update chrome types");
        expect(dependencies).not.toContain("fix stale values");
        expect(fixes).toContain("fix stale values");
        expect(fixes).not.toContain("update dependencies");
        expect(changelog).not.toContain("🧩 Other");
        expect(release.github.releaseNotes({changelog})).toBe(changelog);
    } finally {
        rmSync(cwd, {recursive: true, force: true});
    }
});
