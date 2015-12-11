import NameStack from "./name-stack";
import JSHintOptions from "./JSHintOptions";
export declare var state: {
    option: JSHintOptions;
    cache: {};
    condition: boolean;
    directive: {};
    funct;
    ignored: {
        [line: string]: boolean;
    };
    tab: string;
    lines: string[];
    syntax: {
        [name: string]: any;
    };
    forinifcheckneeded: boolean;
    forinifchecks: any[];
    isStrict: () => boolean;
    inMoz: () => boolean;
    inES6: (strict?: boolean) => boolean;
    inES5: (strict?: boolean) => boolean;
    inClassBody: boolean;
    ignoredLines: {
        [line: string]: boolean;
    };
    jsonMode: boolean;
    nameStack: NameStack;
    reset: () => void;
    tokens: {
        prev;
        next;
        curr;
    };
};
