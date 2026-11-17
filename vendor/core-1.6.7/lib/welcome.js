/**
 * The welcome dialog shows once per release listed here. When a release has
 * notable changes, bump this value and replace the notes alongside CHANGELOG.
 * Leave it unchanged for a release that needs no announcement.
 */
export const WELCOME_RELEASE = '1.6.7';
/** Short what's-new notes for WELCOME_RELEASE, three to five lines each. */
export const WELCOME_NOTES = {
    'zh-CN': [
        '大肥鱼新增 DeepSeek API 峰谷计费徽标：谷期 5 折，显示距离下次峰谷切换的倒计时，可在桌宠右键菜单关闭或重新开启。',
        '峰谷按北京时间判断：工作日 09:00–12:00、14:00–18:00 为峰期；周末及中国法定节假日全天谷期。',
        '修复 DSH 0.2.2-rc.2 中新建与继续会话失败的问题，并同步修复桌宮信封提问的兼容性。',
        '优化宅邸桌宠：桌面与宅邸不再同时出现两个大肥鱼，并修复深色主题下的白色背景。',
        '修复旧开发链接抢占内置桌宠的问题，更新后使用完整包里的新版大肥鱼。',
    ],
    en: [
        'Da Fei Yu now shows DeepSeek API peak/off-peak pricing: 50% off in off-peak hours, a countdown to the next change, and a persistent right-click display toggle.',
        'Billing periods use Beijing time: weekdays 09:00–12:00 and 14:00–18:00 are peak; weekends and Chinese public holidays are off-peak all day.',
        'Restore new and existing conversations on DSH 0.2.2-rc.2 and fix the companion envelope question compatibility issue.',
        'Keep a single Da Fei Yu between the desktop and Mansion, and fix the white background in Mansion dark mode.',
        'Load the desktop pet bundled with WhaleMaid after upgrading, even if an older development link remains.',
    ],
};
//# sourceMappingURL=welcome.js.map