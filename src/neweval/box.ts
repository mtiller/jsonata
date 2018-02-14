import { JSValue } from './environment';

export interface Box<T> {
    values: T[] | undefined;
    preserveSingleton: boolean;
}

export const ubox: Box<JSValue> = { values: undefined, preserveSingleton: false };
export type JBox = Box<JSValue>;

export function boxmap(box: JBox, f: (v: JSValue) => JSValue): JBox {
    // TODO: This is probably where flattening needs to happen
    if (box.values == undefined) return { ...box };
    let vals = box.values.map(v => f(v));
    return { ...box, values: vals };
}
