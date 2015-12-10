import EditorDocument from "../EditorDocument";
import EventEmitterClass from '../lib/event_emitter';
/**
 * WorkerClient manages the communication with a Web Worker.
 */
export default class WorkerClient extends EventEmitterClass {
    private $worker;
    private deltaQueue;
    private callbacks;
    private callbackId;
    private $doc;
    constructor(workerUrl: string);
    init(moduleName: string, className: string): void;
    onMessage(event: MessageEvent): void;
    private $normalizePath(path);
    terminate(): void;
    send(cmd: any, args: any): void;
    call(cmd: any, args: any, callback?: (data: any) => any): void;
    emit(event: string, data: any): void;
    attachToDocument(doc: EditorDocument): void;
    detachFromDocument(): void;
    /**
     * This function is used as the basis for a function where this is bound safely.
     * It handles changes to the document by placing the messages in a queue
     */
    private changeListener(e, doc);
    private $sendDeltaQueue();
    $workerBlob(workerUrl: string): Blob;
}
