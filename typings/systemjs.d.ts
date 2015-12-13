interface Module {
    name: string;
    address: string;
    source?: string;
    metadata?: any;
}

interface SystemJS {
    import(moduleName: string, normalizedParentName?: string): Promise<Module>;
    defined: any;
    defaultJSExtensions: boolean;
    amdDefine: () => void;
    amdRequire: () => void;
    baseURL: string;
    paths: { [key: string]: string };
    meta: { [key: string]: Object };
    config: any;
    normalize(dep: string, parent: string): Promise<string>;
    fetch(load: Module): Promise<string>;
    delete(moduleName: string): void;
    get(moduleName: string): Module;
    has(moduleName: string): boolean;

    typescriptOptions?: any;
}

declare var System: SystemJS;

declare module "systemjs" {
    export = System;
}