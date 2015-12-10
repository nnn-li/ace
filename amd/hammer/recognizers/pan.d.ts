import { ContinuousRecognizer } from './attribute';
import { IComputedEvent } from '../hammer';
/**
 *
 */
export declare class PanRecognizer extends ContinuousRecognizer {
    private pX;
    private pY;
    private direction;
    private threshold;
    private movement;
    constructor(eventName: string, enabled: boolean);
    setDirection(direction: number): PanRecognizer;
    setThreshold(threshold: number): PanRecognizer;
    getTouchAction(): string[];
    directionTest(input: IComputedEvent): boolean;
    attributeTest(input: IComputedEvent): boolean;
    emit(): void;
}
