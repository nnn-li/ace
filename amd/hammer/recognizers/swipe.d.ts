import { ContinuousRecognizer } from './attribute';
import { IComputedEvent } from '../hammer';
/**
 * Swipe
 * Recognized when the pointer is moving fast enough in the allowed direction.
 * @constructor
 * @extends ContinuousRecognizer
 */
export declare class SwipeRecognizer extends ContinuousRecognizer {
    private displacementThreshold;
    private speedThreshold;
    private direction;
    constructor(eventName: string, enabled: boolean);
    getTouchAction(): string[];
    attributeTest(input: IComputedEvent): boolean;
    emit(): void;
}
