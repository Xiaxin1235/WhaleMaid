export const notificationMessages = {
    'zh-CN': {
        abandon: ['放弃这个目标', '不再自动推进，记录保留；须在面板二次确认。'],
        'change-direction': ['改方向', '填写自定义文字作为新方向；交给下一轮规划，之后每轮任务提示都会包含它。'],
        'direction-required': ['请填写新方向', '只选“改方向”没有文字不会执行；请在面板填写新方向。'],
        'direction-too-long': ['新方向太长', '我没有保存或执行，请将新方向缩短到 500 字以内。'],
        'contains-secret': ['说明含敏感信息', '我没有保存或执行，请去掉密钥或敏感信息后重新填写。'],
        decision: ['需要你决定', '我卡住啦，需要你选一下接下来怎么办。'],
        'not-scorable': ['无法自动验收', '我还没有可用的验收依据，不能把这步算成功。你来选下一步吧。'],
        'insufficient-evidence': ['证据还不够', '我还没拿到足够的完成证据，先停在这里。要重试还是看看差异？'],
        tampering: ['验收标准变了', '我发现测试或验收标准被改动，已停下。请先检查差异。'],
        'acceptance-tampering': ['验收标准变了', '我发现测试或验收标准被改动，已停下。请先检查差异。'],
        'fix-rounds-exhausted': [
            '修复额度用完',
            '我已经用完这一步的自动修复次数，仍未通过验收。下一步请你决定。',
        ],
        'verification-unknown': [
            '验收仍未知',
            '我连续两次没能确定验收结果，已经停下。要只重试验收，还是先暂停？',
        ],
        stalled: ['暂时没进展', '我连续几轮没有推进目标，先暂停啦。你想检查一下，还是让我继续？'],
        'planner-need-user': ['需要你决定', '我对下一步还拿不准，先等你决定。可以到面板看详情、补充说明。'],
        'goal-completed': [
            '目标完成',
            '我完成了「{goal}」：{steps}步已验收，测试失败{before}→{after}。看看成果吗？',
        ],
        'next-task-ready': ['下一步就绪', '我已准备好下一步，等你到面板开启执行。'],
        'budget-exhausted': ['今天先到这里', '我今天的模型调用额度用完啦，明天继续；已经执行的结果仍会验收。'],
        'autopilot-disabled': ['自主推进已停', '我遇到了执行异常，已关闭这个目标的自主推进。请到面板看看原因。'],
        'execution-preflight-blocked': [
            '执行前被挡住',
            '我在执行前发现条件还没满足，尚未开始任务。你可以检查后重试。',
        ],
        'execution-stopped': ['执行停下了', '我这次执行没能继续，结果还需要检查。下一步请你决定。'],
        'reconcile-blocked': ['恢复需要检查', '我没能确认工作区与检查点一致，已经停下。请到面板核对。'],
        'option-expired': ['选项已过期', '这个选项已经过期或失效啦，我没有执行。请到面板查看当前状态。'],
        retry: ['再试一次', '在现有授权内重试；不会增加自动修复额度。'],
        accept: ['我来确认完成', '会在没有通过自动验收的情况下标记成功。'],
        rollback: ['撤销后再试', '会撤销这次运行的改动；仍需授权与检查点校验。'],
        'pause-goal': ['先暂停吧', '暂停这个目标，不再启动新任务。'],
        'resume-goal': ['继续推进吧', '恢复这个目标；仍遵守原有授权与额度。'],
        verify: ['再验收一次', '只重试独立验收，不重发任务提示词。'],
        'view-diff': ['先看看差异', '只查看这次改动，不执行修复。'],
        snooze: ['晚点提醒我', '一小时后再提醒一次。'],
        'open-panel': ['打开面板看看', '只打开 WhaleMaid 面板，查看完整证据和操作。'],
    },
    en: {
        abandon: [
            'Abandon this goal',
            'Stops automatic progress and retains records; requires a second panel confirmation.',
        ],
        'change-direction': [
            'Change direction',
            'Use custom text for the new direction; the next planner and every subsequent task prompt will receive it.',
        ],
        'direction-required': [
            'Direction required',
            'Selecting Change direction without text does nothing. Enter a direction in the panel.',
        ],
        'direction-too-long': [
            'Direction too long',
            'Nothing was saved or executed. Keep the new direction within 500 characters.',
        ],
        'contains-secret': ['Sensitive text', 'Nothing was saved or executed. Remove secrets and submit again.'],
        decision: ['Decision', 'I am stuck and need your choice before continuing.'],
        'not-scorable': [
            'No verifier',
            'I do not have usable verification evidence, so I cannot count this step as successful. Please choose what comes next.',
        ],
        'insufficient-evidence': [
            'Evidence',
            'I do not have enough completion evidence. I have stopped here. Would you retry or inspect the changes?',
        ],
        tampering: [
            'Test change',
            'I found changes to tests or acceptance criteria and stopped. Please inspect the diff first.',
        ],
        'acceptance-tampering': [
            'Test change',
            'I found changes to tests or acceptance criteria and stopped. Please inspect the diff first.',
        ],
        'fix-rounds-exhausted': [
            'Repair limit',
            'I have used the automatic repair budget, and verification still fails. Please choose the next step.',
        ],
        'verification-unknown': [
            'Unknown',
            'I could not determine the verification result twice, so I stopped. Retry verification only, or pause?',
        ],
        stalled: [
            'No progress',
            'I have made no progress for several rounds and paused the goal. Would you inspect it or continue?',
        ],
        'planner-need-user': [
            'Decision',
            'I am unsure what to do next. Please review the panel and leave a note or choose an action.',
        ],
        'goal-completed': [
            'Goal done',
            'I finished “{goal}”: {steps} steps verified; failing tests {before} → {after}. Want to review the result?',
        ],
        'next-task-ready': ['Next step', 'I have the next step ready. Open the panel when you want to start it.'],
        'budget-exhausted': [
            'Daily limit',
            'I have used today’s model-call budget. I will continue tomorrow; completed work can still be verified.',
        ],
        'autopilot-disabled': [
            'Stopped',
            'I hit an execution error and turned off this goal’s autopilot. Please review the reason in the panel.',
        ],
        'execution-preflight-blocked': [
            'Preflight',
            'I found an unmet execution condition before starting the task. Please review it before retrying.',
        ],
        'execution-stopped': [
            'Run stopped',
            'I could not continue this run. The result needs checking before you choose the next step.',
        ],
        'reconcile-blocked': [
            'Recovery',
            'I could not reconcile the workspace with its checkpoint, so I stopped. Please inspect it in the panel.',
        ],
        'option-expired': [
            'Expired',
            'That option expired or became invalid, so I did not execute it. Please check the current state in the panel.',
        ],
        retry: ['Try again', 'Retry within the existing scope; automatic repair allowance stays unchanged.'],
        accept: ['Accept manually', 'Marks the task successful without passing automatic verification.'],
        rollback: [
            'Undo and retry',
            'Reverts this run’s changes; authorization and checkpoint checks still apply.',
        ],
        'pause-goal': ['Pause for now', 'Pauses this goal and stops new task launches.'],
        'resume-goal': ['Keep going', 'Resumes within the existing scope and budgets.'],
        verify: ['Verify again', 'Retries independent verification only; never resends the task prompt.'],
        'view-diff': ['Inspect changes', 'Shows the diff without starting a repair.'],
        snooze: ['Remind me later', 'Reminds once in one hour.'],
        'open-panel': ['Open WhaleMaid', 'Opens the panel to inspect full evidence and actions.'],
    },
};
//# sourceMappingURL=notifications.js.map