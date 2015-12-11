import EventEmitter from "./EventEmitter";
export declare var Context: {
    Block: number;
    Template: number;
};
export default class Lexer {
    _lines: string[];
    emitter: EventEmitter;
    source: any;
    prereg: boolean;
    line: number;
    char: number;
    from: number;
    input: string;
    inComment: boolean;
    context: any[];
    templateStarts: any[];
    exhausted: boolean;
    ignoringLinterErrors: boolean;
    constructor(source: any);
    inContext(ctxType: any): boolean;
    pushContext(ctxType: any): void;
    popContext(): any;
    isContext(context: any): boolean;
    currentContext(): any;
    getLines(): string[];
    setLines(val: any): void;
    peek(i?: number): string;
    skip(i?: number): void;
    on(names: any, listener: any): void;
    trigger(unused0?: any, unused1?: any): void;
    triggerAsync(type: any, args: any, checks: any, fn: any): void;
    scanPunctuator(): {
        type: number;
        value: string;
    };
    scanComments(): {
        type: number;
        commentType: string;
        value: any;
        body: any;
        isSpecial: boolean;
        isMultiline: any;
        isMalformed: any;
    };
    scanKeyword(): {
        type: number;
        value: string;
    };
    scanIdentifier(): {
        type: any;
        value: any;
        text: string;
        tokenLength: number;
    };
    scanNumericLiteral(): any;
    scanEscapeSequence(checks: any): {
        char: string;
        jump: number;
        allowNewLine: boolean;
    };
    scanTemplateLiteral(checks: any): {
        type: any;
        value: string;
        startLine: number;
        startChar: number;
        isUnclosed: boolean;
        depth: number;
        context: any;
    };
    scanStringLiteral(checks: any): {
        type: number;
        value: string;
        startLine: number;
        startChar: number;
        isUnclosed: boolean;
        quote: string;
    };
    scanRegExp(): {
        type: number;
        value: string;
        flags: any[];
        isMalformed: boolean;
    };
    scanNonBreakingSpaces(): number;
    scanUnsafeChars(): number;
    next(checks: any): {
        type: number;
        commentType: string;
        value: any;
        body: any;
        isSpecial: boolean;
        isMultiline: any;
        isMalformed: any;
    } | {
        type: number;
        value: string;
        startLine: number;
        startChar: number;
        isUnclosed: boolean;
        quote: string;
    } | {
        type: any;
        value: string;
        startLine: number;
        startChar: number;
        isUnclosed: boolean;
        depth: number;
        context: any;
    };
    nextLine(): boolean;
    start(): void;
    token(): any;
}
