import { ContinuousRecognizer } from './attribute';
import { IComputedEvent } from '../hammer';
/**
 * Rotate
 * Recognized when two or more pointer are moving in a circular motion.
 * @constructor
 * @extends ContinuousRecognizer
 */
export declare class RotateRecognizer extends ContinuousRecognizer {
    private threshold;
    constructor(eventName: string, enabled: boolean);
    getTouchAction(): string[];
    attributeTest(input: IComputedEvent): boolean;
}
