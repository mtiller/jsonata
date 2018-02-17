import { JSValue } from './environment';

export interface Box<T> {
    values: T[] | undefined;
    scalar: boolean;
    preserveSingleton: boolean;
}

export const ubox: Box<JSValue> = { values: undefined, scalar: true, preserveSingleton: false };
export type JBox = Box<JSValue>;

export function boxmap(box: JBox, f: (v: JSValue) => JSValue): JBox {
    // TODO: This is probably where flattening needs to happen
    if (box.values == undefined) return { ...box };
    let vals = box.values.map(v => f(v));
    return { ...box, values: vals };
}

export function boxValue(input: JSValue): JBox {
    if (Array.isArray(input)) {
        return {
            values: input.filter((x) => x!==undefined), // Remove any undefined values
            scalar: false,
            preserveSingleton: false,
        }
    } else {
        return {
            values: [input],
            scalar: true,
            preserveSingleton: false,
        }
    }
}

export function unbox(result: JBox, preserveSingleton?: boolean): JSValue {
    if (result.values == undefined) return undefined;
    if (result.values.length == 1 && (!preserveSingleton || !result.preserveSingleton)) return result.values[0];
    return result.values;
}
