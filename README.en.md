# WhaleMaid

[中文](README.md) | English

WhaleMaid is a project autopilot plugin for DeepSeek Harness (DSH): it plans and executes tasks within the scope you confirm, independently verifies results, and asks you when a decision is needed.

Documentation for **1.0.0**. Requires DSH Desktop **0.2.1-rc.2 or 0.2.1-rc.3** and Node.js ≥22.19. Preview limitations still apply; see the [usage guide](docs/usage.en.md).

## What it can do

| Capability                             | How it works                                                                                                                                                                                                                   |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Goals and authorization                | Draft a goal in natural language, then review the project directory, protected items, actions, exact verification commands and budgets in the panel.                                                                           |
| Autopilot and independent verification | Execute dependent tasks in a separate Git worktree. The host independently runs confirmed verification commands and uses the evidence to continue, stop or request a decision.                                                 |
| Notifications and decisions            | Use the notification center and native DSH questions for pending decisions, with quiet hours, muting, rate limits, retries, pausing, and owner-operated abandonment or changes of direction.                                   |
| Da Fei Yu                              | A dedicated companion conversation, confirmed long-term memories, conversation recaps and experiences, management proposals requiring your confirmation, and a progress brief on the first chat of the day.                    |
| Trusted command execution              | Separately confirm this mode for writable goals to allow ordinary commands. Recognized dangerous commands still require live, one-time approval. Command text cannot fully constrain what an arbitrary script does internally. |

## Get started

Follow the [installation guide](docs/install.en.md) to obtain the code, build a fixed copy and install it into Harness. The guide also covers backups, updates and removal; it does not imply an npm package has been published.

After installation, open **WhaleMaid** in Harness. Start with a small, noncritical project, review the draft and confirm its authorization. Autopilot requires a separate opt-in. See the [usage guide](docs/usage.en.md) for operation, defaults, ways to turn features off and limitations.

## Boundaries

- Models propose plans and suggestions; you confirm authorization in the panel. Memories, recaps, briefs and text read by the model do not grant permissions.
- Unknown outcomes are not successes. After a restart or lost connection, execution with an uncertain outcome is not automatically resent. Pausing, revoking authorization and answering dangerous-command approvals have different effects; see [autopilot and independent verification](docs/usage.en.md#autopilot-and-independent-verification).
- Trusted mode **does not provide directory isolation for arbitrary commands or scripts**. A separate worktree and rollback cannot undo side effects outside it. Read the [trusted execution section](docs/usage.en.md#trusted-command-execution) before enabling it.
- Messages and records are mainly stored locally. Ordinary chat, goal drafting and enabled features such as recaps still use your configured model service; this is not an entirely offline product.

## Relationship to the whale desktop pet

The optional [`@takboo/dsh-coopanion`](https://github.com/takboo/dsh-coopanion) provides the desktop window, character, animation, sound and envelope UI. It is a separate **AGPL-3.0-or-later** project. WhaleMaid cooperates through public DSH conversation, question and approval services; it neither directly depends on nor distributes that plugin's code, character packs or media.

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

Further references: the [documentation index, in Chinese](docs/README.md), [architecture, in Chinese](docs/架构与开发路线.md), [isolated integration setup, in Chinese](docs/dev-dsh.md), and [changelog, in Chinese](CHANGELOG.md). The [product plan, in Chinese](项目规划.txt) includes unimplemented ideas and is not a feature commitment.

## License

WhaleMaid's own code is licensed under [MIT](LICENSE). The independent whale pet uses AGPL-3.0-or-later; its code, character packs and media are not distributed with WhaleMaid.
