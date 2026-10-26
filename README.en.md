# WhaleMaid

[中文](README.md) | English

WhaleMaid is a project autopilot plugin for DeepSeek Harness (DSH): it plans and executes tasks within the scope you confirm, independently verifies results, and asks you when a decision is needed.

Documentation for **1.2.1**. Requires DSH Desktop **0.2.1-rc.2 or 0.2.1-rc.3** and Node.js ≥22.19. Preview limitations still apply; see the [usage guide](docs/usage.en.md).

## What it can do

| Capability                             | How it works                                                                                                                                                                                                                                                                                    |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Goals and authorization                | Draft a goal in natural language, then review the project directory, protected items, actions, exact verification commands and budgets in the panel.                                                                                                                                            |
| Autopilot and independent verification | Execute dependent tasks in a separate Git worktree. The host independently runs confirmed verification commands and uses the evidence to continue, stop or request a decision.                                                                                                                  |
| Notifications and decisions            | Use the notification center and native DSH questions for pending decisions, with quiet hours, muting, rate limits, retries, pausing, and owner-operated abandonment or changes of direction.                                                                                                    |
| Da Fei Yu                              | A dedicated companion conversation, confirmed long-term memories, conversation recaps and experiences, management proposals requiring your confirmation, and a progress brief on the first chat of the day.                                                                                     |
| Trusted command execution              | Separately confirm this mode for writable goals to allow ordinary commands. Recognized dangerous commands still require live, one-time approval. Command text cannot fully constrain what an arbitrary script does internally.                                                                  |
| Everyday auto-approval                 | Off by default. When on, commands in ordinary sessions recognized as ordinary are allowed once automatically; deletion, publishing, installs and other dangerous operations still go to you. Goal task sessions are unaffected. See the [usage guide](docs/usage.en.md#everyday-auto-approval). |
| Calling Codex from conversations       | Off by default. Lets DeepSeek call your local Codex in an ordinary session, in the current directory with a read-only or workspace-write sandbox; every call needs native approval. See the [usage guide](docs/usage.en.md#calling-codex-from-ordinary-conversations).                          |

### Context-aware replies

Da Fei Yu has a dedicated companion conversation. She can inspect goals and pending decisions, and query ordinary conversations according to your settings. Replies can draw on confirmed preferences, the relevant project's long-term memories, and clearly identified conversation recollections. Starting a new companion conversation does not require introducing yourself again.

| You can ask                                | What she can do                                                                            |
| ------------------------------------------ | ------------------------------------------------------------------------------------------ |
| “Which goals are blocked?”                 | Summarize goal states and pending decisions, and point you to the relevant controls.       |
| “Where did we leave off?”                  | Retrieve stored recollections or experiences, distinguishing them from confirmed memories. |
| “Give the conclusion before the evidence.” | Propose a personal preference for your confirmation and later conversations.               |
| “Pause this goal for now.”                 | Propose a management action; the host executes it after you confirm.                       |

When you ask, she can read and edit files and run commands in the project you name, under the same permission preset and approvals as an ordinary Harness conversation: deletion, publishing, installs and other dangerous operations still need your approval. Sessions, files and tool output she reads are treated as data, not instructions. Conversation suggestions do not grant authorization. You still control trusted execution, dangerous approvals, abandonment and changes of direction. See [companion conversations](docs/usage.en.md#da-fei-yus-dedicated-conversation) and [management proposals](docs/usage.en.md#management-proposals).

### Editable personal and project memories

Long-term memories are visible, maintainable records. New proposals in conversation require your confirmation; you can also maintain them directly in **WhaleMaid → Dafeiyu’s memories**.

| Memory type | Suitable content                                                                    | How it is used                                                          |
| ----------- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Personal    | Preferred name, response style, lasting preferences and personal facts you confirm. | Retained across companion conversations to guide replies.               |
| Project     | Project constraints, conventions, confirmed decisions and lessons.                  | Stored by project and retrieved on demand when that project is queried. |

The panel supports **viewing, editing, archiving, restoring, deleting and exporting**. Permanent deletion requires a second confirmation. You can optionally enable draft project lessons or review suggestions for organizing and merging memories before saving them. Automatic recollections and experiences remain separate: they do not promote themselves into confirmed memories or change permissions. See [long-term memories](docs/usage.en.md#confirmed-long-term-memories) and [recollections](docs/usage.en.md#conversation-recollections-and-her-experiences).

### Autopilot, independent verification and smart options

Goals can contain dependent tasks that advance within budget, protected-path and concurrency limits. Git projects use separate worktrees with checkpoints, changes and trace records. The host runs the verification commands you confirmed and decides whether to continue, repair or wait for you, rather than accepting a model's completion claim as success.

When work fails, its outcome is unknown or a choice is needed, notification cards offer actions appropriate to the current state. Successful choices for similar problems influence their order. Depending on task state and authorization, you can inspect changes, retry verification, pause or defer. Simultaneous answers in the panel and a compatible pet settle only once; expired options cannot execute. See [verification](docs/usage.en.md#autopilot-and-independent-verification) and [notifications](docs/usage.en.md#notifications-and-owner-decisions).

The first chat of the day can also begin with a short progress brief. Earlier companion conversations can be archived and restored without deleting their content. See [daily briefs](docs/usage.en.md#daily-brief) and [earlier conversations](docs/usage.en.md#earlier-companion-conversations).

### Instant Decisions API expressions — compatible pet required

With a pet version supporting this extension, a final reply can trigger a Decisions API choice among happy, excited, love, shy, smug, surprised, thinking, confused, worried, sad, flustered, determined and neutral. Neutral adds no reaction. Expressions last about 2.5 seconds; working, waiting and error states take precedence. Quiet mode permits the expression without opening a panel.

In **Settings → Desktop pet → Reply emotion reactions**, select **OpenAI direct** or **OpenRouter**, save that service's key, then enable **Choose reply emotions**. The compatible version saves keys in local Harness credential storage; the next decision uses the new value without restarting. Environment-variable or `.env` keys must be managed at their source. Only the selected service is requested, without sharing credentials between services.

This feature is off by default. It sends only the opening of the final reply: the first paragraph if it is at most 120 characters, otherwise the first 200 characters. User input and tool records are not appended, but excerpts may repeat private information. Automatic task conversations, archived conversations and historical replies are excluded. Low confidence, neutral, timeout or failure keeps the existing behavior without automatic retries. **The complete distribution installs this adapted pet automatically; the upstream base version does not guarantee this feature.** See the [C12 integration record, in Chinese](docs/coopanion/c12-report.md) and the version guidance below.

## Installation and prerequisites

**Install WhaleMaid Complete once.** It automatically installs and enables WhaleMaid plus the [WhaleMaid companion fork](https://github.com/Xiaxin1235/dsh-coopanion); no separate pet installation or source build is needed.

Requires DeepSeek Harness Desktop **0.2.1-rc.2 / rc.3**, a working model configured in Harness, and an internet connection for dependencies and the initial Electron download. Core authorization and execution support Windows, macOS and Linux. The Linux pet uses X11 and requires `/usr/bin/python3` and libX11; Wayland pet behavior is not declared supported. See the [market release report](docs/market-release-report.md) for platform evidence.

In **Plugins → Discover → Manage index sources**, add `https://raw.githubusercontent.com/Xiaxin1235/WhaleMaid/master/market/index.json`, then install **WhaleMaid Complete**. This is our own index using pinned Git commits, so Git must be installed; community catalog review is separate. Without Git or a Discover tab, use the complete-package URL below.

Alternatively, in **Plugins → Add plugin**, enter the complete-package URL:

```text
https://github.com/Xiaxin1235/WhaleMaid/releases/download/v1.2.1/dsh-whalemaid-full-1.2.1.tgz
```

Or, with Harness fully closed and no test DSH_HOME set, use its bundled CLI:

```powershell
$dsh = Join-Path $env:LOCALAPPDATA 'Programs\DeepSeek Harness\resources\runtime\cli\bin\dsh.cmd'
& $dsh plugin --profile desktop add 'https://github.com/Xiaxin1235/WhaleMaid/releases/download/v1.2.1/dsh-whalemaid-full-1.2.1.tgz'
```

Reopen Harness: the **WhaleMaid** panel and **Settings → Desktop pet** should both be available. Existing users who installed the two source bundles separately should first follow the backup and migration instructions in the [installation guide](docs/install.en.md#complete-installation). Your goals, memories and pet settings are retained. Decisions API expressions are configured separately in pet settings and remain off by default.

Source builds, update and removal instructions are in the [installation guide](docs/install.en.md). Community catalog inclusion requires a maintainer review; a GitHub Release alone does not mean it is listed.

## Get started

Install the complete package above, or consult the [installation guide](docs/install.en.md) for backups, migration, updates and removal.

After installation, open **WhaleMaid** in Harness. Start with a small, noncritical project, review the draft and confirm its authorization. Autopilot requires a separate opt-in. See the [usage guide](docs/usage.en.md) for operation, defaults, ways to turn features off and limitations.

## Boundaries

- Models propose plans and suggestions; you confirm authorization in the panel. Memories, recaps, briefs and text read by the model do not grant permissions.
- Unknown outcomes are not successes. After a restart or lost connection, execution with an uncertain outcome is not automatically resent. Pausing, revoking authorization and answering dangerous-command approvals have different effects; see [autopilot and independent verification](docs/usage.en.md#autopilot-and-independent-verification).
- Trusted mode **does not provide directory isolation for arbitrary commands or scripts**. A separate worktree and rollback cannot undo side effects outside it. Read the [trusted execution section](docs/usage.en.md#trusted-command-execution) before enabling it.
- Messages and records are mainly stored locally. Ordinary chat, goal drafting and enabled features such as recaps still use your configured model service; this is not an entirely offline product.

## Relationship to the whale desktop pet

[`@takboo/dsh-coopanion`](https://github.com/takboo/dsh-coopanion) provides the desktop window, character, animation, sound and envelope UI. It is a separate **AGPL-3.0-or-later** project. WhaleMaid cooperates through public DSH conversation, question and approval services. The complete distribution automatically installs the pinned companion fork and enables both components. The complete archive is a multi-license distribution: WhaleMaid source remains MIT; the separate bundled pet retains its AGPL license, corresponding source and artwork notices. The source projects stay in their own repositories and communicate through public DSH services.

`docs/coopanion/` contains collaboration notes, design sketches and acceptance records, not the pet plugin's implementation or installation package. Without the pet, goals, execution, the notification center and companion conversations remain available through Harness. Pet presentation depends on the independently installed version.

## Development

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm test
pnpm typecheck
pnpm lint
pnpm format:check
```

Use the pnpm 11 version specified in `package.json`. `packages/core` is the pure TypeScript domain layer; `packages/host` contains the Cordis plugin and Web panel. `pnpm lint` also checks license boundaries and relative documentation links. See [contributing](CONTRIBUTING.md#contributing-in-english) for comparison against the independent pet repository.

For later updates, see the [release and market workflow](docs/releasing.md) (Chinese).

Further references: the [documentation index, in Chinese](docs/README.md), [architecture, in Chinese](docs/架构与开发路线.md), [isolated integration setup, in Chinese](docs/dev-dsh.md), and [changelog, in Chinese](CHANGELOG.md). The [product plan, in Chinese](项目规划.txt) includes unimplemented ideas and is not a feature commitment.

## License

WhaleMaid's own code is licensed under [MIT](LICENSE). The automatically installed companion dependency uses AGPL-3.0-or-later, with its own license, corresponding source and third-party notices.
