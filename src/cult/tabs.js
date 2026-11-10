/** main screens, top of the menu */
export const CULT_TABS = [
    { t: 'dashboard', l: 'Dashboard' }, { t: 'receiving', l: 'Receiving' }, { t: 'harvest', l: 'Harvest' }, { t: 'schedule', l: 'Schedule' }, { t: 'week', l: 'Week' }, { t: 'testing', l: 'Testing' },
    { t: 'plantings', l: 'Fields' }, { t: 'avail', l: 'Availability' }, { t: 'yields', l: 'Yields' }, { t: 'plan', l: 'Plan' }, { t: 'logs', l: 'Logs' },
];
/** bottom of the menu, same in every module ('setup' is Cultivation settings, Admins only) */
export const CULT_TAIL = [{ t: 'review', l: 'Review' }, { t: 'activity', l: 'Activity' }, { t: 'setup', l: 'Settings' }];
export const cultLabel = (t) => [...CULT_TABS, ...CULT_TAIL].find(x => x.t === t)?.l ?? 'Cultivation';
