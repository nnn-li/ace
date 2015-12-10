/**
 * Returns the last element in an array.
 * @param {T[]} a
 */
export declare function last<T>(a: T[]): T;
export declare function stringReverse(s: string): string;
export declare function stringRepeat(s: string, count: number): string;
export declare function stringTrimLeft(s: string): string;
export declare function stringTrimRight(s: string): string;
export declare function copyObject(obj: any): {};
export declare function copyArray<T>(array: T[]): T[];
export declare function deepCopy(obj: any): any;
export declare function arrayToMap(arr: any): {};
export declare function createMap(props: any): any;
/**
 * splice out of 'array' anything that === 'value'
 */
export declare function arrayRemove(array: any, value: any): void;
export declare function escapeRegExp(str: string): string;
export declare function escapeHTML(str: string): string;
/**
 *
 */
export declare function getMatchOffsets(s: string, searchValue: RegExp): {
    offset: number;
    length: number;
}[];
export declare function deferredCall(fcn: any): any;
export declare function delayedCall(fcn: any, defaultTimeout?: number): any;
