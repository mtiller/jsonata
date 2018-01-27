import { JSValue } from './environment';

export interface Box<T> {
    values: T[] | undefined;
    preserveSingleton: boolean;
}

export const ubox: Box<JSValue> = { values: undefined, preserveSingleton: false };
export type JBox = Box<JSValue>;
