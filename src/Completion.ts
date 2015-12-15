/**
 * @class Completion
 */
interface Completion {

    /**
     * @property value
     * @type string
     */
    value?: string;

    /**
     * @property caption
     * @type string
     */
    caption?: string;

    /**
     * @property snippet
     * @type string
     */
    snippet?: string;

    /**
     * @property matchMask
     * @type number
     */
    matchMask?: number;

    /**
     * @property exactMatch
     * @type number
     */
    exactMatch?: number;

    /**
     * @property score
     * @type number
     */
    score?: number;

    /**
     * @property identifierRegex
     * @type RegExp
     */
    identifierRegex?: RegExp;

    /**
     * @property meta
     * @type string
     */
    meta?: string;
}

export default Completion;