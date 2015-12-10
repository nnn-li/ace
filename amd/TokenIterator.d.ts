import EditSession from './EditSession';
/**
 *
 *
 * This class provides an essay way to treat the document as a stream of tokens, and provides methods to iterate over these tokens.
 * @class TokenIterator
 **/
/**
 * Creates a new token iterator object. The inital token index is set to the provided row and column coordinates.
 * @param {EditSession} session The session to associate with
 * @param {Number} initialRow The row to start the tokenizing at
 * @param {Number} initialColumn The column to start the tokenizing at
 *
 * @constructor
 **/
export default class TokenIterator {
    private $session;
    private $row;
    private $rowTokens;
    private $tokenIndex;
    constructor(session: EditSession, initialRow: number, initialColumn: number);
    /**
    *
    * Tokenizes all the items from the current point to the row prior in the document.
    * @returns {[String]} If the current point is not at the top of the file, this function returns `null`. Otherwise, it returns an array of the tokenized strings.
    **/
    stepBackward(): {
        start: number;
        type: string;
        value: string;
    };
    /**
    *
    * Tokenizes all the items from the current point until the next row in the document. If the current point is at the end of the file, this function returns `null`. Otherwise, it returns the tokenized string.
    * @returns {String}
    **/
    stepForward(): {
        start: number;
        type: string;
        value: string;
    };
    /**
    *
    * Returns the current tokenized string.
    * @returns {String}
    **/
    getCurrentToken(): {
        start: number;
        type: string;
        value: string;
    };
    /**
    *
    * Returns the current row.
    * @returns {Number}
    **/
    getCurrentTokenRow(): number;
    /**
    *
    * Returns the current column.
    * @returns {Number}
    **/
    getCurrentTokenColumn(): number;
}
