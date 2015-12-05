
interface TokenIteratorHost {
    getTokens(row: number);
    getTokenAt(row: number, column: number);
    getLength(): number;
}

export = TokenIteratorHost;