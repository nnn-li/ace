import MarkerConfig from './layer/MarkerConfig';
import Range from './Range';

/**
 * @class Marker
 */
interface Marker {

    /**
     * @property id
     * @type number
     * @optional
     */
    id?: number;

    /**
     * One of "fullLine", "line", "text", or "screenLine".
     *
     * @property type
     * @type string
     */
    type: string;

    /**
     * @property clazz
     * @type string
     */
    clazz: string;

    /**
     * @property inFront
     * @type boolean
     * @optional
     */
    inFront?: boolean;

    /**
     * @property renderer
     */
    renderer?/*: (builder: (number | string)[], range: Range, left: number, top: number, config: MarkerConfig) => any*/;

    /**
     * @property range
     * @type Range
     */
    range?: Range;

    /**
     * @property update
     */
    update?;
}

export default Marker;