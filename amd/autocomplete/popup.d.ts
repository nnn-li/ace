import EventEmitterClass from "../lib/event_emitter";
export interface ListView {
    isOpen: boolean;
    focus: any;
    container: any;
    on(eventName: string, callback: any, capturing?: boolean): any;
    getData(row: number): any;
    setData(data: string[]): any;
    getRow(): any;
    setRow(row: number): any;
    getTextLeftOffset(): number;
    show(pos: any, lineHeight: any, topdownOnly?: any): void;
    hide(): any;
    setTheme(theme: string): void;
    setFontSize(fontSize: any): void;
    getLength(): number;
}
export declare class ListViewPopup implements ListView {
    private editor;
    private $borderSize;
    private $imageSize;
    private hoverMarker;
    private hoverMarkerId;
    private selectionMarker;
    private selectionMarkerId;
    isOpen: boolean;
    private isTopdown;
    private lastMouseEvent;
    private lastMouseEventScrollTop;
    private data;
    private screenWidth;
    constructor(parentNode: Node);
    /**
     * @param {{top;left}} pos
     * @param {number} lineHeight
     * @param {boolean} topdownOnly
     */
    show(pos: {
        top: number;
        left: number;
    }, lineHeight: number, topdownOnly?: boolean): void;
    hide(): void;
    setData(list: any): void;
    getData(row: number): any;
    on(eventName: string, callback: (event, ee: EventEmitterClass) => any, capturing?: boolean): (event: any, ee: EventEmitterClass) => void;
    getTextLeftOffset(): number;
    setSelectOnHover(val: any): void;
    setHoverMarker(row: number, suppressRedraw?: boolean): void;
    getHoveredRow(): number;
    getRow(): number;
    setRow(row: number): void;
    setTheme(theme: string): void;
    setFontSize(fontSize: string): void;
    focus: () => void;
    getLength(): number;
    container: HTMLElement;
}
