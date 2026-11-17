/** Replacement shown wherever a secret-looking value was removed. */
export const REDACTED = '[已隐藏]';
const PATTERNS = [
    // PEM private keys, including the whole armored block.
    /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z0-9 ]*PRIVATE KEY-----|$)/g,
    // Provider API keys (OpenAI/DeepSeek/Anthropic style) and GitHub tokens.
    /\bsk-(?:ant-|proj-)?[A-Za-z0-9_-]{16,}/g,
    /\bgh[pousr]_[A-Za-z0-9]{20,}/g,
    /\bgithub_pat_[A-Za-z0-9_]{20,}/g,
    // AWS access key ids.
    /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g,
    // Bearer credentials in headers or prose.
    /\bBearer\s+[A-Za-z0-9._~+/=-]{12,}/gi,
];
// `NAME_KEY=value`, `token: value`, `"password": "value"` – keep the name, hide the value.
const ASSIGNMENT = /(\b[A-Za-z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD|PASSWD|CREDENTIAL)S?\b["']?\s*[:=]\s*["']?)([^\s"',;]{4,})/gi;
/** Hide secret-looking substrings before a transcript reaches the companion model. */
export function redactSecrets(text) {
    let out = text;
    for (const pattern of PATTERNS)
        out = out.replace(pattern, REDACTED);
    return out.replace(ASSIGNMENT, (_, name, value) => value === REDACTED || value.startsWith(REDACTED) ? `${name}${value}` : `${name}${REDACTED}`);
}
//# sourceMappingURL=redact.js.map