import { IComputedEvent, Recognizer } from '../hammer';
export declare class ContinuousRecognizer extends Recognizer {
    private pointers;
    /**
     * This recognizer is just used as a base for the simple attribute recognizers.
     * @constructor
     * @extends Recognizer
     */
    constructor(eventName: string, enabled: boolean, pointers: number);
    /**
     * Used to check if the recognizer receives valid input, like input.distance > 10.
     * @memberof ContinuousRecognizer
     * @param {IComputedEvent} input
     * @return {Boolean} recognized
     */
    attributeTest(input: IComputedEvent): boolean;
    /**
     * Process the input and return the state for the recognizer
     * @memberof ContinuousRecognizer
     * @param {Object} input
     * @return {*} State
     */
    process(input: IComputedEvent): number;
}
