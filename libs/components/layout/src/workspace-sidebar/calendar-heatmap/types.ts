export type CalendarDay = {
    level?: Level;
    /** Date number, 1-31 */
    dayInMonth: number;
    /** The number of current operation records, currently using the number of pages currently created */
    activitiesOfDay: number;
};

export type Level = 1 | 2 | 3 | 4 | 5;

export type Theme = {
    readonly level1: string;
    readonly level2: string;
    readonly level3: string;
    readonly level4?: string;
    readonly level5?: string;
};
