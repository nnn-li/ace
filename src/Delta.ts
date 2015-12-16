import Range from "./Range";

/**
 * @class Delta
 */
interface Delta {

    /**
     * @property action
     * @type string
     */
    action: string;

    /**
     * @property lines
     * @type string[]
     */
    lines?: string[];

    /**
     * @property range
     * @type Range
     */
    range: Range;

    /**
     * @property text
     * @type string
     */
    text: string;

    /**
     * @property ignore
     * @type boolean
     * @optional
     */
    ignore?: boolean;
}

export default Delta;