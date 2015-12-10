export interface ListenerTarget extends EventTarget {
}
export declare function addListener(target: ListenerTarget, type: string, callback: any, useCapture?: boolean): void;
export declare function removeListener(target: ListenerTarget, type: any, callback: any, useCapture?: boolean): void;
export declare function stopEvent(e: Event): boolean;
export declare function stopPropagation(e: Event): void;
export declare function preventDefault(e: Event): void;
export declare function getButton(e: MouseEvent): number;
/**
 * Returns a function which may be used to manually release the mouse.
 */
export declare function capture(unused: HTMLElement, acquireCaptureHandler: (event: MouseEvent) => void, releaseCaptureHandler: (event: MouseEvent) => void): (event: MouseEvent) => void;
/**
 * Adds a portable 'mousewheel' ['wheel','DOM MouseScroll'] listener to an element.
 */
export declare function addMouseWheelListener(element: HTMLElement, callback: (event: MouseWheelEvent) => void): void;
export declare function addMultiMouseDownListener(el: any, timeouts: any, eventHandler: any, callbackName: any): void;
export declare function getModifierString(e: any): any;
export declare function addCommandKeyListener(el: any, callback: any): void;
/**
 * A backwards-compatible, browser-neutral, requestAnimationFrame.
 */
export declare var requestAnimationFrame: (callback: () => void, $window: Window) => void;
