export declare function get(key: string): any;
export declare function set(key: string, value: any): void;
export declare function all(): {};
export declare function _emit(eventName: string, e?: any): any;
export declare function _signal(eventName: string, e?: any): void;
/**
 *
 */
export declare function moduleUrl(name: string, component: string): string;
export declare function setModuleUrl(name: string, subst: string): string;
/**
 * A map from module name to an array of callbacks.
 */
export declare var $loading: {
    [name: string]: ((m) => any)[];
};
export declare function loadModule(moduleName: any, onLoad: (m: any) => any, doc?: Document): any;
/**
 * Who calls this function?
 */
export declare function init(packaged: boolean): string;
export declare function defineOptions(obj: any, path: string, options: any): any;
export declare function resetOptions(obj: any): void;
export declare function setDefaultValue(path: any, name: any, value: any): void;
export declare function setDefaultValues(path: any, optionHash: any): void;
