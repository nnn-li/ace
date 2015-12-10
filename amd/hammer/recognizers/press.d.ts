import { IComputedEvent, Recognizer } from '../hammer';
export declare class PressRecognizer extends Recognizer {
    private _timer;
    private _input;
    private pointers;
    private time;
    private threshold;
    /**
     * Press
     * Recognized when the pointer is down for x ms without any movement.
     * @constructor
     * @extends Recognizer
     */
    constructor(eventName: string, enabled: boolean);
    getTouchAction(): string[];
    process(input: IComputedEvent): number;
    reset(): void;
    emit(): void;
}
