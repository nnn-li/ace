import InputStream from './InputStream';
/**
 *
 * @param {Object} tokenHandler
 * @constructor
 */
export default class Tokenizer {
    _tokenHandler: any;
    _state: (buffer) => boolean;
    _inputStream: InputStream;
    _currentToken: any;
    _temporaryBuffer: string;
    _additionalAllowedCharacter: string;
    static DATA: (buffer) => boolean;
    static RCDATA: (buffer) => boolean;
    static RAWTEXT: (buffer) => boolean;
    static SCRIPT_DATA: (buffer) => boolean;
    static PLAINTEXT: (buffer) => boolean;
    constructor(tokenHandler: any);
    lineNumber: number;
    columnNumber: number;
    _parseError(code: any, args?: any): void;
    _emitToken(token: any): void;
    _emitCurrentToken: () => void;
    _currentAttribute: () => any;
    setState: (state: any) => void;
    tokenize: (source: any) => void;
}
