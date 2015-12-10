/**
 * Batches changes (that force something to be redrawn) in the background.
 */
export default class RenderLoop {
    pending: boolean;
    private onRender;
    private changes;
    private $window;
    constructor(onRender: (changes: number) => void, $window?: Window);
    schedule(change: number): void;
}
