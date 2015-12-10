import { ContinuousRecognizer } from './attribute';
import { IComputedEvent } from '../hammer';
/**
 * Pinch
 * Recognized when two or more pointers are moving toward (zoom-in) or away from each other (zoom-out).
 * @constructor
 * @extends ContinuousRecognizer
 */
export declare class PinchRecognizer extends ContinuousRecognizer {
    private threshold;
    private scale;
    constructor(eventName: string, enabled: boolean);
    getTouchAction(): string[];
    attributeTest(input: IComputedEvent): boolean;
    emit(): void;
}
