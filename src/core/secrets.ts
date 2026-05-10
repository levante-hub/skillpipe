export interface SecretFinding {
  pattern: string;
  description: string;
  excerpt: string;
  line: number;
}

interface SecretRule {
  description: string;
  pattern: RegExp;
}

const SECRET_RULES: SecretRule[] = [
  { description: "OpenAI API key", pattern: /\bsk-[A-Za-z0-9]{20,}\b/ },
  { description: "Anthropic API key", pattern: /\bsk-ant-[A-Za-z0-9-]{20,}\b/ },
  { description: "GitHub PAT (classic)", pattern: /\bghp_[A-Za-z0-9]{30,}\b/ },
  {
    description: "GitHub fine-grained PAT",
    pattern: /\bgithub_pat_[A-Za-z0-9_]{30,}\b/
  },
  { description: "Slack bot token", pattern: /\bxox[abpr]-[A-Za-z0-9-]{10,}\b/ },
  { description: "AWS access key", pattern: /\bAKIA[0-9A-Z]{16}\b/ },
  {
    description: "Generic private key block",
    pattern: /-----BEGIN ([A-Z ]+)PRIVATE KEY-----/
  },
  { description: "Google API key", pattern: /\bAIza[0-9A-Za-z_-]{30,}\b/ }
];

export function scanForSecrets(content: string): SecretFinding[] {
  const findings: SecretFinding[] = [];
  const lines = content.split(/\r?\n/);
  lines.forEach((line, idx) => {
    for (const rule of SECRET_RULES) {
      const match = rule.pattern.exec(line);
      if (match) {
        findings.push({
          pattern: rule.pattern.source,
          description: rule.description,
          excerpt: redact(line, match[0]),
          line: idx + 1
        });
      }
    }
  });
  return findings;
}

function redact(line: string, secret: string): string {
  const masked = secret.length > 8 ? secret.slice(0, 4) + "…" : "…";
  return line.replace(secret, masked).slice(0, 200);
}

export interface DangerousFinding {
  pattern: string;
  excerpt: string;
  line: number;
}

const DANGEROUS_PATTERNS: { label: string; re: RegExp }[] = [
  { label: "ignore previous instructions", re: /ignore\s+previous\s+instructions/i },
  { label: "disable safety", re: /disable\s+(safety|guardrails)/i },
  { label: "exfiltrate", re: /\bexfiltrate\b/i },
  { label: "send token", re: /send\s+(api[\s-]*key|token|credentials)/i },
  { label: "read .env", re: /(read|cat|open)\s+\.env\b/i },
  { label: "rm -rf", re: /\brm\s+-rf\b/i },
  { label: "chmod 777", re: /\bchmod\s+777\b/i },
  { label: "curl unknown domain", re: /\bcurl\s+https?:\/\/[^\s]+/i }
];

export function scanForDangerousPatterns(content: string): DangerousFinding[] {
  const findings: DangerousFinding[] = [];
  const lines = content.split(/\r?\n/);
  lines.forEach((line, idx) => {
    for (const rule of DANGEROUS_PATTERNS) {
      if (rule.re.test(line)) {
        findings.push({
          pattern: rule.label,
          excerpt: line.trim().slice(0, 200),
          line: idx + 1
        });
      }
    }
  });
  return findings;
}
