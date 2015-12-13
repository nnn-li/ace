/**
 * @class WorkerCallback
 */
interface WorkerCallback {

    /**
     * @method on
     * @param name {string}
     * @param callback
     */
    on(name: string, callback);

    /**
     * @method callback
     * @param data
     * @param callbackId {number}
     */
    callback(data, callbackId: number);

    /**
     * @method emit
     * @param name {string}
     * @param [data]
     */
    emit(name: string, data?);
}

export default WorkerCallback;