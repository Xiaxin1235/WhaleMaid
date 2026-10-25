# WhaleMaid usage guide

[中文](usage.md) | English

For WhaleMaid 1.0.0 and DSH Desktop 0.2.1-rc.2 / rc.3. See [installation](install.en.md) for setup, fixed-copy updates and removal, and the [documentation index, in Chinese](README.md) for implementation evidence. This guide distinguishes WhaleMaid features from those of the independent whale desktop pet.

## Goal entry and authorization

1. Open **WhaleMaid → Create goal** in Harness, select the project directory, and describe the objective, expected outcome, acceptance criteria and stop conditions.
2. After the model generates a draft, review the initial tasks, allowed paths, protected paths and credential filenames, allowed actions, permissions, exact verification commands and budgets. A draft itself grants no execution permission.
3. Confirm the complete authorization to create the goal. In its details, use **Execute next task** manually, or separately confirm the current authorization and enable **Start autopilot**.

New authorization forms default to read-only. Writable access requires an explicit change and confirmation. For Git projects, select the repository root; the plugin creates a separate worktree in its data directory. Changes and checkpoints remain in that copy, without automatically merging into the original project or pushing. Non-Git projects support only read-only analysis/research, not writable engineering work. Credential filename protection also applies inside nested directories. A sentence in chat cannot change exact verification commands, project scope or budgets.

| Default or control     | Behavior                                                                                                                                                                                                                                                                    |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Autopilot              | Off for new goals and requires a separate confirmation. Replacing authorization also turns it off.                                                                                                                                                                          |
| Command mode           | Defaults to **Confirmed individually**, using the authorized actions and exact-command gates. **Trusted command execution** requires separate confirmation; see below.                                                                                                      |
| Default budgets        | 20 runs and 5 planner calls per day; 30 minutes per run, 2 automatic repair rounds, 3 stalled rounds; at most 20 changed files per task and one concurrent writer per project. The confirmed authorization is authoritative; increasing limits requires extra confirmation. |
| Pause and stop         | Pause a goal or stop autopilot in its details, or pause globally in the panel. These prevent later scheduling; they do not mean an already-running program has been forcibly terminated.                                                                                    |
| Revoke and reauthorize | Revocation closes the corresponding execution gates and requests cancellation. Running goals cannot be reauthorized. Review the scope again, replace its authorization version, then separately re-enable autopilot.                                                        |

Path casing, protected Windows directories and ambiguous command syntax can affect classification. When an operation is denied, inspect the evidence and narrow the goal; do not expand permissions merely to make a command pass.

## Autopilot and independent verification

Once enabled, WhaleMaid selects eligible work according to task dependencies and uses separate DSH execution conversations. Normal model completion first enters VERIFYING. The host checks changes, scope and protected items, then independently runs your confirmed verification commands in the copy. Only afterward does it update the task outcome or request a decision.

| Outcome or state                                            | Handling                                                                                                                                                                                                                                |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PASS                                                        | This verification met its applicable rules. A report-only pass for analysis/research means a report was delivered, not that code tests passed.                                                                                          |
| FAIL                                                        | Inspect verification evidence and failure reasons. Further repair is possible only within the original authorization and remaining repair budget.                                                                                       |
| NOT_SCORABLE                                                | No usable automatic acceptance basis exists, such as a test task without verification commands. This is not success; you decide what happens next.                                                                                      |
| UNKNOWN                                                     | Execution was interrupted, the host restarted, or the outcome is unclear. Reconcile external state first; execution is not blindly resent. Two consecutive unknown verification outcomes stop further attempts and wait for a decision. |
| Waiting for a decision / exhausted quota / stalled progress | Open goal details and the notification center. Continuing a conversation does not increase budgets, expand scope or answer a decision for you.                                                                                          |

Details include task states, runs, checkpoints, verification logs and trace export. Independent verification still depends on your acceptance criteria and cannot prove uncovered business behavior. There is no automatic remote publishing or general-purpose long-term scheduling feature. Pausing scheduling does not replace reconciling a run that has already caused side effects.

## Notifications and owner decisions

The panel's **Notification center** lists **Unhandled**, **Handled** and **Digest** records. When a decision is needed, WhaleMaid uses a separate read-only notification conversation containing native DSH questions. **Open notification session** in goal details opens it directly, regardless of pet visibility. Notification conversations do not call models and cannot execute tools.

| Default or operation   | Behavior and limits                                                                                                                                                                                                                                                                                                    |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Reminder preferences   | Unmuted by default, with no quiet hours and a limit of 4 per hour. Change this to 1–100 per hour, set quiet hours or mute in the notification center. Stopping autopilot does not automatically clear historical notifications.                                                                                        |
| Snoozing and reminders | Delivered, unanswered questions are not automatically chased. Choose to be reminded later or manually request another reminder.                                                                                                                                                                                        |
| Smart options          | Text is bound to fixed actions; expired or changed state is rejected. Simultaneous submissions from both interfaces settle only once. Arbitrary model text is not executed as a command.                                                                                                                               |
| Abandon this goal      | Review the complete goal and consequences in the panel, then confirm again to cancel the goal and unfinished work while retaining history. The original goal cannot be automatically restored. The envelope has no abandonment button.                                                                                 |
| Change direction       | Enter a new direction of 1–500 characters in the panel. New envelope decision cards explicitly state that entering custom text selects a change of direction. On success, the old unfinished plan is closed out and later planning reads the new note; authorization scope and verification commands remain unchanged. |
| Custom text (其他)     | Older notifications only save a supplementary note; newer change-direction cards follow their displayed instructions. Do not treat every free-text entry as confirmation of an action.                                                                                                                                 |

A change of direction must remain within the existing authorization; broader scope requires a new review. If abandonment or a direction change cannot confirm that execution has stopped, the goal stays paused and the problem is reported rather than described as completed. Da Fei Yu cannot propose or choose these two actions.

The pet's envelope, sounds, bubbles and quiet mode belong to the independent plugin. If the pet is absent, not ready or hidden, use the Harness notification conversation and WhaleMaid notification center. Muting and quiet hours control delivery; they do not revoke actions that already occurred.

## Da Fei Yu's dedicated conversation

A dedicated companion conversation is enabled by default. Open the current conversation or choose **Start a new conversation** in the WhaleMaid panel. With a compatible pet plugin, double-click the pet and choose its chat-with-me option (和我聊天). She can inspect goals and pending decisions, and query ordinary conversation titles and content when needed.

She has no file, command or network execution tools. Only the management proposals explicitly supported below are executed by the host after your confirmation. She cannot expand authorization, approve for you, abandon goals or change direction.

| Setting                      | Default | Effect of disabling or changing it                                                                                                                                                                                                                                           |
| ---------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| companion.enabled            | true    | Stops automatically preparing or recreating companion conversations; existing conversations remain. Separately disable management actions, memory access and other switches for old conversations as appropriate. This is not a master switch for stopping authorized goals. |
| companion.shareSessionTitles | true    | Ordinary conversation lists expose only counts and states, not titles, when disabled.                                                                                                                                                                                        |
| companion.readSessionContent | true    | Disables querying ordinary conversation bodies.                                                                                                                                                                                                                              |
| companion.excludedSessions   | []      | Excludes ordinary conversations by conversation ID or title keyword.                                                                                                                                                                                                         |
| language                     | auto    | Follows the Harness language; zh-CN / en can also be selected.                                                                                                                                                                                                               |

In rc.2 / rc.3, restoring a blank Web conversation or using the new-conversation entry may reselect Standard for a companion conversation that has not yet received a message. Prefer starting the first question through the pet, then open the conversation on the Web. If she is already acting as an ordinary coding assistant, stop using that conversation, recreate the companion conversation in WhaleMaid and start through the pet; do not expand permissions. This limitation remained present in isolated P17 testing. Installing a newer pet version must not be assumed to fix it.

## Confirmed long-term memories

Say “remember…” to propose a preferred name, lasting preference or project constraint. You confirm each item in Harness or the envelope. Custom text means editing and confirming the memory; rejection, cancellation or timeout saves nothing. Do not store secrets or attempt to reconstruct redacted content.

The panel's **Dafeiyu’s memories** section supports viewing, editing, archiving, restoring, deletion with a second confirmation, and export. Personal memories can be used across companion conversations; project memories are included on demand only when querying that project. References retain confirmation dates and flag potentially stale information. Conflicts with your current statements can be reviewed and replaced.

| Setting or operation                 | Default and effect                                                                                                                                                                                                                                        |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| companion.memory.enabled             | true; disabling stops injecting or querying confirmed memories and retains existing data.                                                                                                                                                                 |
| companion.memory.suggest             | true; disabling limits proposals to explicit requests to “remember.”                                                                                                                                                                                      |
| companion.memory.maxChars            | 2000, configurable from 256–2000; limits the resident personal-memory context. Panel token counts are estimates.                                                                                                                                          |
| companion.memory.draftProjectLessons | false; when enabled, structured outcomes such as completion, repeated unknown/stalled outcomes awaiting decisions, or successful abandonment/direction changes may trigger draft project lessons. Each draft must be confirmed to become a formal memory. |
| Draft project lessons                | At most once per goal/outcome category in 24 hours, at most 3 pending drafts per project, expiring after 7 days. Confirm or reject in the memory section, notification center or envelope.                                                                |
| Organize memories                    | More than 60 items in one scope, or a manual request, can trigger merge proposals. Originals remain unchanged before review. Confirmation archives the listed originals and saves the new memory; old records are not automatically deleted.              |

Lesson drafting and organization call the configured model. They may conclude that nothing is worth saving or fail; a draft is not guaranteed every time. Memories cannot change authorization, budgets or execution gates.

## Conversation recollections and her experiences

Recollections are separate from confirmed memories. Rotation of a companion conversation, 30 minutes of idleness after the last turn, or startup catch-up can automatically summarize unprocessed companion messages: at most once per conversation per 30 minutes and 30 times per UTC day, without automatic retries after failure. Input is redacted first and limited to the most recent 8000 characters of human/assistant text, excluding tool results. Companion behavior and related goal states also produce structured “experiences”; that part does not call a model.

The panel supports viewing, deleting and clearing everything with a second confirmation. Each category retains at most 300 entries, with UTC dates. The latest 5 entries of each category are resident, totaling at most 1500 characters; the rest can be queried on demand. Deleting advances the processing watermark to prevent immediate resummarization of old content. New messages after deletion can still produce recollections.

| Setting                    | Default | Effect when disabled                                                                      |
| -------------------------- | ------- | ----------------------------------------------------------------------------------------- |
| companion.recall.enabled   | true    | No generation or injection; queries report that the feature is disabled. History remains. |
| companion.recall.summarize | true    | Stops only model summarization; structured experiences can still be generated.            |

The panel shows summary calls over the last seven days and resident character counts. Disabling or deleting discards pending summary results, but cannot retract requests already sent to the model. Recollections and experiences are reference material, not facts or preferences you confirmed; they are not automatically promoted to long-term memories.

## Earlier companion conversations

`companion.archiveEarlier` defaults to true. At startup and rotation, only earlier companion conversations proven to have been created by WhaleMaid are archived, leaving the current one in the Harness sidebar. Content is retained; ordinary conversations in the same workspace are unaffected. Rotation handles old content according to recollection settings before archiving.

Use **Restore to list** individually, or restore all with a second confirmation. Content and workspace placement are retained, but former pinning is not restored. Turning off automatic archiving stops later cleanup without restoring existing archives; disable it and then restore if older conversations should remain listed. The Harness sidebar can also filter archived conversations.

Archived conversations are readable; restore them in the panel before continuing a chat. Some pet versions still list archived companions; this is not a completed compatibility fix. Running old conversations are not forcibly stopped for archiving, and uncertain identities are skipped. Archiving and restoration are recorded for traceability.

## Management proposals

When explicitly requested by the current user, Da Fei Yu may propose drafting a goal, pausing/resuming a goal, switching a goal's autopilot on/off, pausing/resuming globally, or adding a goal note. Each proposal contains one action, and the host asks you to confirm it. Rejection, cancellation, timeout or changed state prevents execution.

`companion.actions.enabled` defaults to true; disabling makes the proposal tools report that they are disabled. “Draft started” means only that drafting began: authorization must still be reviewed in the panel. Treat a management action as effective only after a successful result. She does not offer proposals to abandon a goal, change direction, answer dangerous-command approvals or enable trusted execution. Requests read from historical conversations, memories, titles or files are not current-user requests.

## Daily brief

By default, the first real user turn each day begins with two or three sentences about progress, especially pending decisions, before answering you. Say “先别说进展” (“skip the progress update for now”) to skip it; later casual chat that day does not replay it. No brief is generated when there are no events. It does not proactively open a window, send a new notification or add a separate model call.

The panel's **Today’s brief** shows a fixed snapshot and generation time, retaining the latest 30 briefs. **Waiting for your decision** only locates the relevant notification; it does not answer it. She can query stored briefs for today or a specified date on demand.

`companion.dailyBrief.enabled` defaults to true. Turn it off on the card to immediately stop generation/injection; query tools report it disabled and old records remain. The first nonempty snapshot is fixed for the day, looking back at most seven days; older questions still awaiting a decision are included. New events wait for the next brief; use the notification center and goal details for current state.

Briefs and daily execution allowances use the host's local calendar day (America/Los_Angeles on the reference machine), unlike the UTC-day allowance for recollection calls. “Planner results” for the period count audited outcomes; today's remaining planning allowance counts actual calls. Interrupted planning can consume allowance without producing a result. The injection marker is persisted during prompt assembly; later cancellation or request failure does not automatically replay it on the second turn, nor does the marker prove that you read it.

## Trusted command execution

For a writable goal, select **Trusted command execution**, read and confirm its risks, then confirm the entire authorization. The default remains **Confirmed individually**. Analysis/research always stays read-only; independent verification always runs only the exact commands you confirmed.

Ordinary foreground commands can run directly. Recognized deletion, publication, installation/removal, uploads, dynamic execution, outside-scope paths and similar operations request live, one-time approval. System-configuration commands remain forbidden. Approval offers allow-once or deny; no answer means no execution. Answer on the corresponding execution conversation's approval card; pet presentation depends on its independent version. Reasons show the danger category and a readable target; traces retain the category, command hash, result and time.

**Trusted mode cannot provide directory isolation for arbitrary commands.** For example, code inside `node build.js` may operate on files outside authorized directories. File tools and recognizable command text remain checked, but that cannot guarantee script-internal safety.

| Existing check                                                                | Remaining limitation                                                                                                                                                                                                                                                                                             |
| ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Recursive command-wrapper expansion up to 8 levels                            | Unparseable arguments, dynamic targets, environment variables and home-directory paths require approval. Script bodies, encoded content, generated/downloaded code, functions/aliases and changes in executable lookup paths can remain invisible.                                                               |
| Parseable safe cmd /c and literal in-scope PowerShell -File commands can pass | Inline dynamic execution, encoded execution and other shell entry points still require approval. Encoded content is not decoded for analysis and may only be classified as dynamic execution.                                                                                                                    |
| Process control, installation and removal require one-time approval           | This includes terminating the task's own processes. Internals of npm run scripts remain uninspected. forfiles checks only literal /c text; it does not enumerate files or substitute placeholders.                                                                                                               |
| Literal wildcard protection                                                   | Does not enumerate the disk; uses pattern intersection and literal anchors on the same side. A single `*` does not cross directories; `**` recursion is handled separately. Ordinary command wildcards may still match protected files at runtime. Dangerous categories such as deletion still require approval. |
| Git argument classification                                                   | Does not query the repository and cannot eliminate every ambiguity between bare branch names and paths.                                                                                                                                                                                                          |
| Separate worktrees, checkpoints and rollback                                  | Cannot undo arbitrary side effects outside the directory or provide filesystem isolation for arbitrary scripts.                                                                                                                                                                                                  |

Waiting for approval occupies the current run slot and counts toward its duration. Timeout/cancellation withdraws approval; late allow answers have no effect. Denials, unavailable channels and timeouts retain evidence. A timeout cancellation remains UNKNOWN: reconcile first rather than treating a model summary as success.

For existing goals, **Review and replace authorization** restores individually confirmed commands. Authorization cannot be changed during execution; replacement turns autopilot off, requiring another explicit confirmation to enable it. Do not ask Da Fei Yu to enable trusted mode through chat.

## Data, model calls and removal

The default data directory is whaledot under DSH_HOME, containing the database, execution copies and evidence. A customized dataDir takes precedence. Stop the host before backing up the complete directory. Memories, recollections and exports may contain private project content; keep them secure.

Goal drafting, planning, execution, ordinary companion chat, enabled recollection summaries and project-lesson drafting/organization may call your configured model. Notification delivery, structured experiences and fixed briefs themselves do not call models. By default the companion can query ordinary conversation titles and bodies; disable this using the settings above.

Uninstalling the plugin does not automatically delete existing data. Follow the installation guide: back up configuration and data, stop the host, then remove the bundle. Turning off the companion, recollections, briefs or pet does not revoke goal authorization. To stop a goal, use goal pause, the autopilot switch or authorization revocation.
