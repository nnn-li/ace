export default function has(obj: any, v: string): boolean {
    if (typeof v !== 'string') {
        throw new Error("has(obj, v): v must be a string");
    }
    if (obj && obj.hasOwnProperty) {
        return obj.hasOwnProperty(v);
    }
    else {
        return false;
    }
}
