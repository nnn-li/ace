import Range from "../Range";
import EditSession from '../EditSession';
export default class Marker {
    private element;
    private session;
    private markers;
    private config;
    private $padding;
    constructor(parentEl: Node);
    setPadding(padding: number): void;
    setSession(session: EditSession): void;
    setMarkers(markers: any): void;
    update(config: any): void;
    private $getTop(row, layerConfig);
    private drawTextMarker(stringBuilder, range, clazz, layerConfig, extraStyle?);
    private drawMultiLineMarker(stringBuilder, range, clazz, config, extraStyle?);
    drawSingleLineMarker(stringBuilder: any, range: Range, clazz: string, config: any, extraLength?: number, extraStyle?: any): void;
    private drawFullLineMarker(stringBuilder, range, clazz, config, extraStyle?);
    private drawScreenLineMarker(stringBuilder, range, clazz, config, extraStyle?);
}
