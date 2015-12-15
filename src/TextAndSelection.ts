/**
 * A possible return value from transformAction.
 *
 * @class TextAndSelection
 */
interface TextAndSelection {

    /**
     * @property text
     * @type string
     */
    text: string;

    /**
     * @property selection
     * @type number[]
     */
    selection: number[];
}

export default TextAndSelection;