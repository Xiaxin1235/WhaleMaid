export interface ProjectFacts {
    projectRoot: string;
    isGit: boolean;
    clean: boolean;
    branch: string | null;
    candidateCommands: {
        command: string;
        class: 'safe' | 'needs-approval' | 'forbidden';
        reasons: string[];
    }[];
}
/** Resolve existing ancestors as well as missing leaves; reject symlinks escaping the project. */
export declare function projectPath(root: string, input: string): Promise<string>;
/** Only inspect known metadata files; candidate commands are never run or selected automatically. */
export declare function inspectProject(input: string): Promise<ProjectFacts>;
