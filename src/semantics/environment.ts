import { EvaluationOptions } from "./options";

export interface Environment<L> {
    lookup(name: string): L;
}

export abstract class Env<T> implements Environment<T> {
    protected bindings: { [key: string]: T } = {};
    constructor(protected options: EvaluationOptions, public enclosing?: Environment<T>) {}
    bindBox(name: string, box: T) {
        this.bindings[name] = box;
    }
    abstract lookup(name: string): T;
    // nested() {
    //     return new Env(this.options, this);
    // }
}
