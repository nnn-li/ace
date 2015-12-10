import EditorDocument from './EditorDocument';
import EventEmitterClass from "./lib/event_emitter";
import Tokenizer from './Tokenizer';
/**
 * Tokenizes the current [[EditorDocument `EditorDocument`]] in the background, and caches the tokenized rows for future use.
 *
 * If a certain row is changed, everything below that row is re-tokenized.
 *
 * @class BackgroundTokenizer
 **/
/**
 * Creates a new `BackgroundTokenizer` object.
 * @param {Tokenizer} tokenizer The tokenizer to use
 * @param {Editor} editor The editor to associate with
 *
 * @constructor
 **/
export default class BackgroundTokenizer extends EventEmitterClass {
    /**
     * This is the value returned by setTimeout, so it's really a timer handle.
     * There are some conditionals looking for a falsey value, so we use zero where needed.
     */
    private running;
    private lines;
    private states;
    private currentLine;
    private tokenizer;
    private doc;
    private $worker;
    constructor(tokenizer: Tokenizer, editor?: any);
    /**
     * Sets a new tokenizer for this object.
     *
     * @param {Tokenizer} tokenizer The new tokenizer to use
     *
     **/
    setTokenizer(tokenizer: Tokenizer): void;
    /**
     * Sets a new document to associate with this object.
     * @param {EditorDocument} doc The new document to associate with
     **/
    setDocument(doc: EditorDocument): void;
    /**
    * Fires whenever the background tokeniziers between a range of rows are going to be updated.
    *
    * @event update
    * @param {Object} e An object containing two properties, `first` and `last`, which indicate the rows of the region being updated.
    *
    **/
    /**
     * Emits the `'update'` event. `firstRow` and `lastRow` are used to define the boundaries of the region to be updated.
     * @param {number} firstRow The starting row region
     * @param {number} lastRow The final row region
     *
     **/
    fireUpdateEvent(firstRow: number, lastRow: number): void;
    /**
     * Starts tokenizing at the row indicated.
     *
     * @param {number} startRow The row to start at
     *
     **/
    start(startRow: number): void;
    scheduleStart(): void;
    $updateOnChange(delta: {
        range: {
            start: {
                row;
            };
            end: {
                row;
            };
        };
        action: string;
    }): void;
    /**
     * Stops tokenizing.
     *
     **/
    stop(): void;
    /**
     * Gives list of tokens of the row. (tokens are cached)
     *
     * @param {number} row The row to get tokens at
     *
     *
     *
     **/
    getTokens(row: number): {
        start: number;
        type: string;
        value: string;
    }[];
    /**
     * [Returns the state of tokenization at the end of a row.]{: #BackgroundTokenizer.getState}
     *
     * @param {number} row The row to get state at
     **/
    getState(row: number): string;
    $tokenizeRow(row: number): {
        start: number;
        type: string;
        value: string;
    }[];
}
