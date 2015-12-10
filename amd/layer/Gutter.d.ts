import EventEmitterClass from "../lib/event_emitter";
import EditSession from "../EditSession";
export default class Gutter extends EventEmitterClass {
    element: HTMLDivElement;
    gutterWidth: number;
    $annotations: any[];
    $cells: {
        element;
        textNode;
        foldWidget;
    }[];
    private $fixedWidth;
    private $showLineNumbers;
    private $renderer;
    private session;
    private $showFoldWidgets;
    $padding: any;
    constructor(parentEl: HTMLElement);
    setSession(session: EditSession): void;
    setAnnotations(annotations: {
        html: string;
        row: number;
        text: string;
        type: string;
    }[]): void;
    $updateAnnotations(e: any, session: EditSession): void;
    update(config: any): void;
    setShowLineNumbers(show: any): void;
    getShowLineNumbers(): boolean;
    setShowFoldWidgets(show: boolean): void;
    getShowFoldWidgets(): boolean;
    $computePadding(): any;
    /**
     * Returns either "markers", "foldWidgets", or undefined.
     */
    getRegion(point: {
        clientX: number;
    }): string;
}
