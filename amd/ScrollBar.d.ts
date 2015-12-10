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
     * Creates a new `ScrollBar`.
     *
     * @class
     * @constructor
     * @param parent {HTMLlement} A paent of the scrollbar.
     * @param classSuffix {string}
     */
    constructor(parent: HTMLElement, classSuffix: string);
    /**
     * @method setVisible
     * @param isVisible {boolean}
     * @return {ScrollBar}
     */
    setVisible(isVisible: boolean): ScrollBar;
}
