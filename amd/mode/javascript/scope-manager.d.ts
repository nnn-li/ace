/**
 * Creates a scope manager that handles variables and labels, storing usages
 * and resolving when variables are used and undefined
 */
export declare var scopeManager: (state: any, predefined: any, exported: any, declared: any) => {
    on: (names: any, listener: any) => void;
    isPredefined: (labelName: any) => boolean;
    stack: (type: any) => void;
    unstack: () => void;
    addParam: (labelName: any, token: any, type: any) => void;
    validateParams: () => void;
    getUsedOrDefinedGlobals: () => string[];
    getImpliedGlobals: () => any;
    getUnuseds: () => any[];
    has: (labelName: any, unused?: any) => boolean;
    labeltype: (labelName: any) => any;
    addExported: (labelName: any) => void;
    setExported: (labelName: any, token: any) => void;
    addlabel: (labelName: any, opts: any) => void;
    funct: {
        labeltype: (labelName: any, options: any) => any;
        hasBreakLabel: (labelName: any) => boolean;
        has: (labelName: string, options?: any) => boolean;
        add: (labelName: any, type: any, tok: any, unused: any) => void;
    };
    block: {
        isGlobal: () => boolean;
        use: (labelName: any, token: any) => void;
        reassign: (labelName: any, token: any) => void;
        modify: (labelName: any, token: any) => void;
        add: (labelName: any, type: any, tok: any, unused: any) => void;
        addBreakLabel: (labelName: any, opts: any) => void;
    };
};
