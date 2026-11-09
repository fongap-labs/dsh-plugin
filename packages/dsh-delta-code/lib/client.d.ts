/**
 * Native DSH Plugins -> Code Worker -> Configure page.
 * Single, self-contained lazy-CJS client module; no DOM patching or Host fetch endpoints.
 * All writes use the Host's revision-fenced ConfigForm, with path-level secret edits.
 */
interface ReactApi {
    createElement(type: string | ((props: any) => unknown), props?: Record<string, unknown> | null, ...children: unknown[]): unknown;
    useState<T>(init: T | (() => T)): [T, (value: T | ((old: T) => T)) => void];
    useEffect(fn: () => void | (() => void), deps?: readonly unknown[]): void;
}
type Op = {
    op: 'set';
    path: string[];
    value: unknown;
} | {
    op: 'unset';
    path: string[];
};
type Account = {
    owner: string;
    tokenEnv: string;
    sourceIndex: number;
};
type Server = {
    language: string;
    command: string;
    args: string;
};
interface Draft {
    enabled: boolean;
    autoRouting: boolean;
    workspaceRoot: string;
    gitEnabled: boolean;
    gitCommand: string;
    githubEnabled: boolean;
    githubAllowWrites: boolean;
    allowWorktreeWrites: boolean;
    allowCommands: boolean;
    systemPromptText: string;
    accounts: Account[];
    servers: Server[];
}
interface ConfigState {
    status: string;
    value?: any;
    revision?: number;
    writable: boolean;
}
interface ConfigPageProps {
    view: 'page' | 'summary';
    form?: {
        state: ConfigState;
        mutate(ops: Op[], revision?: number): Promise<boolean>;
    };
}
declare const NAME = "@fongap-labs/dsh-delta-code";
declare const ROW_KEY: string;
declare const OWNER: RegExp;
declare const ENV: RegExp;
declare const inset: Record<string, string>;
declare const inputStyle: Record<string, string>;
declare const actionStyle: Record<string, string>;
declare function readDraft(value: any): Draft;
declare function validation(draft: Draft, value: any): string | undefined;
declare function operations(draft: Draft, value: any): Op[];
declare function installClient(require: (id: string) => unknown): {
    inject: string[];
    apply(ctx: any): void;
};
