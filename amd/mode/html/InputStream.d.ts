export default class InputStream {
    data: string;
    start: number;
    committed: number;
    eof: boolean;
    lastLocation: {
        line: number;
        column: number;
    };
    constructor();
    slice(): any;
    char(): any;
    advance(amount: any): number;
    matchWhile(re: any): string;
    matchUntil(re: any): string;
    append(data: any): void;
    shift(n: any): any;
    peek(n: any): any;
    length(): number;
    unget(d: any): void;
    undo(): void;
    commit(): void;
    location(): {
        line: number;
        column: number;
    };
    static EOF: number;
    static DRAIN: number;
}
