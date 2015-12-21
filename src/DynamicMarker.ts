import Range from './Range';

interface DynamicMarker {
    id?: number;
    type: string;
    clazz: string;
    inFront?: boolean;
    renderer?;
    range?: Range;
    update?;
}

export default DynamicMarker;