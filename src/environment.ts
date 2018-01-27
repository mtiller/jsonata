export type JSValue = number | string | boolean | object | Function;
export type JEnv = EvalEnv<JSValue>;

export class EvalEnv<T> {
    protected bindings: { [key: string]: T } = {}
    constructor(public enclosing?: EvalEnv<T>) {}
    bind(name: string, value: T) {
        this.bindings[name] = value;
    }
    lookup(name: string): T {
        if (this.bindings.hasOwnProperty(name)) {
            return this.bindings[name];
        }
        if (this.enclosing) {
            return this.enclosing.lookup(name);
        }
        // TODO: Throw exception instead?!?
        return undefined;
    }
    nested() {
        return new EvalEnv(this);
    }
}
