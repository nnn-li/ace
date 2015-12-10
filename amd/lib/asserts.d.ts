export declare var ENABLE_ASSERTS: boolean;
export declare class AssertionError implements Error {
    name: string;
    message: any;
    constructor(message: any, args: any);
}
export declare function assert(condition: any, message?: any, args?: any): any;
