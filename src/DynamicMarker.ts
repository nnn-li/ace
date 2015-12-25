import MarkerConfig from './layer/MarkerConfig';
import Range from './Range';

/**
 * @class DynamicMarker
 */
interface DynamicMarker {

    /**
     * @property id
     * @type number
     * @optional
     */
    id?: number;

    /**
     * One of "fullLine", "line", "text", "screenLine".
     *
     * @property type
     * @type string
     */
    type: string;

    clazz: string;

    /**
     * @property inFront
     * @type boolean
     * @optional
     */
    inFront?: boolean;

    renderer?/*: (builder: (number | string)[], range: Range, left: number, top: number, config: MarkerConfig) => any*/;
    range?: Range;
    update?;
}

export default DynamicMarker;