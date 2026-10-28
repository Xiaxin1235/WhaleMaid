import type { NotificationDeliverer } from '../notify/deliverer.js';
import type { CompanionMemory } from '../companion/memory.js';
import type { MemoryDrafts } from '../companion/drafts.js';
import type { CompanionRecall } from '../companion/recall.js';
import type { CompanionDailyBrief } from '../companion/daily-brief.js';
import type { CompanionArchives } from '../companion/archive.js';
import type { NotificationRouter } from '../notify/router.js';
import type { AutopilotScheduler } from '../autopilot/scheduler.js';
import type { Context } from '@deepseek-ai/cordis';
import type { ConnectionRpcHandler, ConnectionFetchRoute, HostConnectionHandle, PeerScope } from '@deepseek-ai/dsh-client-connection';
import type { ProjectGoal, ScopeId } from '#whalemaid/core';
import type { TaskVerifier } from '../verify/verify-task.js';
import type { TaskExecutor } from '../execution/execute-task.js';
import type { GoalIntake } from '../goal-intake/service.js';
import type { PanelMethod } from './contract.js';
import type { PanelStatus } from './contract.js';
import type { EverydayApprovals } from '../everyday-approval/service.js';
import type { ConversationCodex } from '../codex/service.js';
import { languagePatch } from './handlers.js';
export interface PanelRuntime {
    codex?: ConversationCodex;
    everydayApprovals?: EverydayApprovals;
    brief?: CompanionDailyBrief;
    setDailyBrief?: (enabled: boolean) => Promise<void>;
    archives?: CompanionArchives;
    setArchiveEarlier?: (enabled: boolean) => Promise<void>;
    recall?: CompanionRecall;
    setRecallSettings?: (patch: {
        enabled?: boolean | undefined;
        summarize?: boolean | undefined;
    }) => Promise<void>;
    memoryDrafts?: MemoryDrafts;
    setDraftProjectLessons?: (enabled: boolean) => Promise<void>;
    memory?: CompanionMemory;
    snapshot(): PanelStatus;
    setLanguage(patch: ReturnType<typeof languagePatch>): Promise<void>;
    goals(): ProjectGoal[];
    setPaused(paused: boolean): void;
    revokeScope(scopeId: ScopeId, peer: PeerScope): void;
    takeoverStore(): void;
    notifier?: NotificationDeliverer;
    notificationRouter?: NotificationRouter;
    autopilot?: AutopilotScheduler;
    verification?: TaskVerifier;
    execution?: TaskExecutor;
    intake?: GoalIntake;
    rebuildCompanion?: () => Promise<unknown>;
    /** Records why a panel call failed; the panel itself only receives a short code. */
    logFailure?: (method: string, error: unknown) => void;
}
/** Peer is supplied by Connection after admission, never accepted from a payload. */
export declare function createPanelHandler(runtime: PanelRuntime): ConnectionRpcHandler;
export declare function installPanelApi(ctx: Context, snapshot: () => PanelStatus, storage: Pick<PanelRuntime, 'goals' | 'setPaused' | 'revokeScope' | 'takeoverStore' | 'intake' | 'execution' | 'verification' | 'autopilot' | 'notifier' | 'notificationRouter' | 'rebuildCompanion' | 'logFailure' | 'memory' | 'memoryDrafts' | 'recall' | 'archives' | 'brief' | 'everydayApprovals' | 'codex'>): void;
/** Exact Connection routes coexist with Gateway's exclusive /api interceptor. */
export declare function createPanelRoute(method: PanelMethod, runtime: PanelRuntime, admit: HostConnectionHandle['admit']): ConnectionFetchRoute;
