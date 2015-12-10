import Range from "./Range";
import EditSession from "./EditSession";
/**
 * @class Search
 *
 * A class designed to handle all sorts of text searches within a [[Document `Document`]].
 *
 **/
/**
 *
 *
 * Creates a new `Search` object. The following search options are avaliable:
 *
 * - `needle`: The string or regular expression you're looking for
 * - `backwards`: Whether to search backwards from where cursor currently is. Defaults to `false`.
 * - `wrap`: Whether to wrap the search back to the beginning when it hits the end. Defaults to `false`.
 * - `caseSensitive`: Whether the search ought to be case-sensitive. Defaults to `false`.
 * - `wholeWord`: Whether the search matches only on whole words. Defaults to `false`.
 * - `range`: The [[Range]] to search within. Set this to `null` for the whole document
 * - `regExp`: Whether the search is a regular expression or not. Defaults to `false`.
 * - `start`: The starting [[Range]] or cursor position to begin the search
 * - `skipCurrent`: Whether or not to include the current line in the search. Default to `false`.
 *
 * @constructor
 **/
export default class Search {
    $options: any;
    constructor();
    /**
     * Sets the search options via the `options` parameter.
     * @param {Object} options An object containing all the new search properties
     *
     *
     * @returns {Search}
     * @chainable
    **/
    set(options: any): this;
    /**
     * [Returns an object containing all the search options.]{: #Search.getOptions}
     * @returns {Object}
    **/
    getOptions(): {};
    /**
     * Sets the search options via the `options` parameter.
     * @param {Object} An object containing all the search propertie
     * @related Search.set
    **/
    setOptions(options: any): void;
    /**
     * Searches for `options.needle`. If found, this method returns the [[Range `Range`]] where the text first occurs. If `options.backwards` is `true`, the search goes backwards in the session.
     * @param {EditSession} session The session to search with
     *
     *
     * @returns {Range}
    **/
    find(session: EditSession): Range;
    /**
     * Searches for all occurances `options.needle`. If found, this method returns an array of [[Range `Range`s]] where the text first occurs. If `options.backwards` is `true`, the search goes backwards in the session.
     * @param {EditSession} session The session to search with
     *
     *
     * @returns {[Range]}
    **/
    findAll(session: EditSession): Range[];
    /**
     * Searches for `options.needle` in `input`, and, if found, replaces it with `replacement`.
     * @param {String} input The text to search in
     * @param {String} replacement The replacing text
     * + (String): If `options.regExp` is `true`, this function returns `input` with the replacement already made. Otherwise, this function just returns `replacement`.<br/>
     * If `options.needle` was not found, this function returns `null`.
     *
     *
     * @returns {String}
    **/
    replace(input: string, replacement: string): string;
    private $matchIterator(session, options);
    $assembleRegExp(options: any, $disableFakeMultiline?: boolean): any;
    private $assembleMultilineRegExp(needle, modifier);
    private $lineIterator(session, options);
}
