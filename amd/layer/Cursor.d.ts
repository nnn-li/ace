import EditSession from '../EditSession';
export default class Cursor {
    element: HTMLDivElement;
    private session;
    private isVisible;
    isBlinking: boolean;
    private blinkInterval;
    private smoothBlinking;
    private intervalId;
    private timeoutId;
    private cursors;
    private cursor;
    private $padding;
    private overwrite;
    private $updateCursors;
    config: any;
    $pixelPos: any;
    constructor(parentEl: HTMLDivElement);
    private $updateVisibility(val);
    private $updateOpacity(val);
    setPadding(padding: number): void;
    setSession(session: EditSession): void;
    private setBlinking(blinking);
    private setBlinkInterval(blinkInterval);
    setSmoothBlinking(smoothBlinking: boolean): void;
    private addCursor();
    private removeCursor();
    hideCursor(): void;
    showCursor(): void;
    restartTimer(): void;
    getPixelPosition(position: {
        row: number;
        column: number;
    }, onScreen?: any): {
        left: number;
        top: number;
    };
    update(config: any): void;
    private $setOverwrite(overwrite);
    destroy(): void;
}
