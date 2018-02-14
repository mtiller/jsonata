export type JSValue = number | string | boolean | object | Function;

export class EvalEnv<T> {
    protected bindings: { [key: string]: T } = {};
    constructor(public enclosing?: EvalEnv<T>) {
        if (enclosing) {
            Object.keys(enclosing).forEach(key => {
                this.bind(key, enclosing[key]);
            });
        }
    }
    bind(name: string, value: T) {
        this.bindings[name] = value;
    }
    merge(bindings: { [key: string]: T }) {
        Object.keys(bindings).forEach(key => (this.bindings[key] = bindings[key]));
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

export class JEnv extends EvalEnv<JSValue> {}
