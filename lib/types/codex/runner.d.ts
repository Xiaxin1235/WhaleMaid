import type { CodexArguments, CodexRecord } from './contract.js';
export declare function codexEnvironment(input: NodeJS.ProcessEnv): NodeJS.ProcessEnv;
export type WindowsSandbox = 'elevated' | 'unelevated';
/**
 * User config is ignored, but on Windows `workspace-write` needs a sandbox backend or Codex
 * blocks every write. Carry over only the backend the user already set up; it enforces, never widens.
 */
export declare function codexArguments(cwd: string, mode: CodexArguments['mode'], windowsSandbox?: WindowsSandbox): string[];
/** Read only `[windows] sandbox` from the user's Codex config; any other key or value is ignored. */
export declare function windowsSandboxFrom(configToml: string): WindowsSandbox | undefined;
/**
 * Prefer the current standalone install: its `codex-resources` holds the Windows sandbox
 * helpers that writable mode needs. The older Programs copy lacks them.
 */
export declare function defaultCodexExecutable(env: NodeJS.ProcessEnv): Promise<string>;
export declare function codexRedactor(env: NodeJS.ProcessEnv): (value: string) => string;
export interface CodexRunInput extends CodexArguments {
    sessionId: string;
    cwd: string;
    timeoutMs: number;
    signal: AbortSignal;
}
export interface CodexResult {
    status: string;
    message: string;
    record: CodexRecord;
}
export interface CodexRunnerOptions {
    executable?: string;
    env?: NodeJS.ProcessEnv;
    /** Test executable prefix, never obtained from model arguments or configuration. */
    prefix?: string[];
    onProgress?: (message: string) => void;
}
/** Only the fixed native probe sees machine-wide PowerShell modules; the model CLI does not. */
export declare function nativePowerShellEnvironment(env: NodeJS.ProcessEnv, shell: string, host?: NodeJS.ProcessEnv): NodeJS.ProcessEnv;
export declare function stopCodexTree(pid: number, env: NodeJS.ProcessEnv): Promise<void>;
/** Standalone execution/logging adapter. It has no dependency on Autopilot or the pet. */
export declare class CodexRunner {
    readonly dataDir: string;
    private readonly options;
    private readonly env;
    private readonly clean;
    private current;
    constructor(dataDir: string, options?: CodexRunnerOptions);
    previewTask(task: string): string;
    history(): Promise<CodexRecord[]>;
    private persist;
    private record;
    skipped(input: Pick<CodexRunInput, 'sessionId' | 'cwd' | 'task' | 'mode'>, status: string): Promise<CodexResult>;
    run(input: CodexRunInput): Promise<CodexResult>;
    dispose(): Promise<void>;
    private gitStatus;
    private execute;
}
