"use strict";

/**
 * @class Annotation
 */
interface Annotation {

    /**
     * @property html
     * @type string
     */
    html?: string;

    /**
     * @property row
     * @type number
     */
    row: number;

    /**
     * @property column
     * @type number
     */
    column?: number;

    /**
     * @property text
     * @type string
     */
    text: string;
    /**
     * "error", "info", or "warning".
     * @property type
     * @type string
     */
    type: string;
}

export default Annotation;
