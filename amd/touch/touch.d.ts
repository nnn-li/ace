import Editor from '../Editor';
import { Manager } from '../hammer/hammer';
export interface ITouch {
    clientX: number;
    clientY: number;
    pageX: number;
    pageY: number;
    screenX: number;
    screenY: number;
}
export interface ITouchEvent extends Event {
    type: string;
    touches: ITouch[];
}
export declare function touchManager(editor: Editor): Manager;
