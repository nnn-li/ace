import { IComputedEvent, Recognizer } from '../hammer';
export declare class TapRecognizer extends Recognizer {
    private pTime;
    private pCenter;
    private _timer;
    private count;
    private taps;
    private pointers;
    private time;
    private threshold;
    private interval;
    private posThreshold;
    private center;
    constructor(eventName: string, enabled: boolean);
    getTouchAction(): string[];
    process(input: IComputedEvent): number;
    failTimeout(): number;
    reset(): void;
    emit(): void;
}
