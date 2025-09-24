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
                    {type: "feat", section: "Features", hidden: false},
                    {type: "fix", section: "Bug Fixes", hidden: false},
                    {type: "perf", section: "Performance Improvements", hidden: false},
                    {type: "refactor", section: "Refactoring", hidden: false},
                    {type: "chore", section: "Chores", hidden: false},
                ],
            },
            writerOpts: {
                headerPartial:
                    "## 🚀 {{#if @root.pkg}}{{@root.pkg.name}} {{else}}{{~#if name}}{{name}} {{/if}}{{/if}}{{version}}\n\n",
                commitPartial:
                    "{{#if type}}* {{#if scope}}**{{scope}}:** {{/if}}{{#if subject}}{{subject}}{{else}}{{header}}{{/if}}\n\n{{~#if body}}{{{body}}}\n{{/if}}{{/if}}",

                groupBy: "type",
                commitGroupsSort: "title",
                commitsSort: ["scope", "subject"]
            }
        }
    ]
];

module.exports = {commonPlugins};
