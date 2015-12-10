import EditSession from "./EditSession";
import Marker from "./layer/Marker";
export default class SearchHighlight {
    private regExp;
    clazz: string;
    private type;
    private cache;
    constructor(regExp: RegExp, clazz: string, type: string);
    setRegexp(regExp: RegExp): void;
    update(html: any, markerLayer: Marker, session: EditSession, config: {
        firstRow: number;
        lastRow: number;
    }): void;
}
