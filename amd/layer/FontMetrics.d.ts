import EventEmitterClass from "../lib/event_emitter";
export default class FontMetrics extends EventEmitterClass {
    private el;
    private $main;
    private $measureNode;
    $characterSize: {
        width: number;
        height: number;
    };
    private charSizes;
    private allowBoldFonts;
    private $pollSizeChangesTimer;
    constructor(parentEl: HTMLElement, interval: any);
    private $testFractionalRect();
    private $setMeasureNodeStyles(style, isRoot?);
    checkForSizeChanges(): void;
    $pollSizeChanges(): number;
    private setPolling(val);
    private $measureSizes();
    private $measureCharWidth(ch);
    private getCharacterWidth(ch);
    private destroy();
}
