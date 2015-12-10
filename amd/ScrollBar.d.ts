import EventEmitterClass from "./lib/event_emitter";
/**
 * An abstract class representing a native scrollbar control.
 * @class ScrollBar
 **/
export default class ScrollBar extends EventEmitterClass {
    element: HTMLDivElement;
    inner: HTMLDivElement;
    isVisible: boolean;
    skipEvent: boolean;
    /**
     * Creates a new `ScrollBar`. `parent` is the owner of the scroll bar.
     * @param {DOMElement} parent A DOM element
     *
     * @constructor
     **/
    constructor(parent: HTMLElement, classSuffix: string);
    setVisible(isVisible: any): void;
}
