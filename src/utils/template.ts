export interface SkillTemplateInput {
  name: string;
  description?: string;
  author?: string;
  target?: string;
}

export function renderSkillTemplate(input: SkillTemplateInput): string {
  const description =
    input.description ?? `Describe what the ${input.name} skill does.`;
  const author = input.author ? `\nauthor: ${yamlScalar(input.author)}` : "";
  const target = input.target ?? "claude-code";

  return `---
name: ${input.name}
version: 0.1.0
description: ${yamlScalar(description)}${author}
tags: []
targets:
  - ${target}
---

# ${toTitle(input.name)} Skill

## Goal

Describe the goal of this skill in one or two sentences.

## When to use this skill

Describe the situations where the agent should activate this skill.

## Instructions

1. Step one.
2. Step two.
3. Step three.

## Output format

Describe how the agent should structure its response.
`;
}

export function renderSkillReadme(name: string): string {
  return `# ${toTitle(name)}

Skill managed by Skillpipe.

See \`SKILL.md\` for the agent-facing instructions.
`;
}

export function renderRepoReadme(name: string): string {
  return `# ${name}

Personal agent skills repository, managed with [Skillpipe](https://github.com/saulgomezjimenez/skillpipe).

## Layout

- \`skills/\` — agent skills, one folder per skill.
- \`agents/\` — agent definitions.
- \`workflows/\` — multi-step workflows.
- \`skillpipe.json\` — repository metadata.

## Install a skill in your environment

\`\`\`bash
skillpipe repo connect <this-repo-url>
skillpipe install <skill-name>
\`\`\`
`;
}

function toTitle(s: string): string {
  return s
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .map((w) => (w.length > 0 ? w[0]!.toUpperCase() + w.slice(1) : ""))
    .join(" ");
}

function yamlScalar(value: string): string {
  return JSON.stringify(value);
}
