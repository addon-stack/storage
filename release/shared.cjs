const commonPlugins = [
    [
        "@semantic-release/commit-analyzer",
        {
            preset: "conventionalcommits",
            releaseRules: [
                {type: "feat", release: "minor"},
                {type: "fix", release: "patch"},
                {type: "perf", release: "patch"},
                {type: "refactor", release: "patch"},
                {type: "chore", release: false},
                {type: "chore", scope: "deps", release: "patch"},
                {type: "chore", scope: "security", release: "patch"},
            ],
        },
    ],
    [
        "@semantic-release/release-notes-generator",
        {
            preset: "conventionalcommits",
            presetConfig: {
                types: [
                    {type: "feat", section: "Features"},
                    {type: "fix", section: "Bug Fixes"},
                    {type: "perf", section: "Performance Improvements"},
                    {type: "refactor", section: "Refactoring"},
                    {type: "chore", section: "Chores"},
                ],
            },
            writerOpts: {
                commitPartial:
                    "{{#if type}}{{#if scope}}**{{scope}}:** {{/if}}{{subject}}\n\n{{#if body}}{{body}}\n{{/if}}{{/if}}",
            },
        },
    ],
];

module.exports = {commonPlugins};
