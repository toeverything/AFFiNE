/**
 * Get the current time in ISO format, the return value example is 2021-11-17T15:45:56, the return value can be directly used to create a Date object
 */
export function getDateIsoStringWithTimezone(dateMilliseconds?: number) {
    if (dateMilliseconds === undefined || dateMilliseconds === null) {
        dateMilliseconds = Date.now();
    }
    //offset in milliseconds
    const timezoneOffset = new Date().getTimezoneOffset() * 60000;
    const date_iso_string = new Date(
        dateMilliseconds - timezoneOffset
    ).toISOString();
    return date_iso_string.slice(0, -5);
}
