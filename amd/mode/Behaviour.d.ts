export default class Behaviour {
    private $behaviours;
    constructor();
    add(name: any, action: any, callback: any): void;
    addBehaviours(behaviours: any): void;
    remove(name: string): void;
    inherit(mode: any, filter?: string[]): void;
    getBehaviours(filter?: string[]): {};
}
