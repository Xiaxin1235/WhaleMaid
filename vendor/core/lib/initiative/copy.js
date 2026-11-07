const findings = {
    en: {
        repeatedFailure: ['Repeated failure', 'The same acceptance failure occurred at least three times.'],
        stallWarning: ['Progress stall', 'The goal is one unchanged round away from pausing.'],
        noAcceptance: ['Limited acceptance evidence', 'Several tasks lack a measured acceptance result.'],
        budgetBurn: [
            'Budget running low',
            'At least 80% of a limit is used, with at most half the tasks passed.',
        ],
        pendingBacklog: ['Decision waiting', 'A decision has been unanswered for at least 24 hours.'],
        idleGoal: ['Idle goal', 'An authorized goal has been idle for at least seven days.'],
        leftovers: ['Remaining work', 'A completed goal still has cancelled tasks.'],
    },
    'zh-CN': {
        repeatedFailure: ['同一原因反复失败', '同一种验收失败至少出现了三次。'],
        stallWarning: ['停滞前兆', '再有一轮进度不变，目标就会暂停。'],
        noAcceptance: ['验收依据不足', '部分任务缺少可测量的验收结果。'],
        budgetBurn: ['预算将尽', '至少一项额度已用八成，通过的任务不超过一半。'],
        pendingBacklog: ['决定积压', '有一项决定已等待至少 24 小时。'],
        idleGoal: ['目标长期闲置', '一个已授权的目标至少闲置了七天。'],
        leftovers: ['完成后的遗留', '已完成目标还有被取消的任务。'],
    },
};
export function initiativeFindingCopy(locale, detector) {
    const [name, summary] = findings[locale][detector];
    return { name, summary };
}
//# sourceMappingURL=copy.js.map