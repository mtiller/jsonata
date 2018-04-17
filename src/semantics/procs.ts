import { Environment } from "./environment";
import * as ast from "../ast";
import { Signature } from "../signatures";

export interface ProcedureDetails<V> {
    input: V;
    environment: Environment<V>;
    eval: (node: ast.ASTNode, input: V, environment: Environment<V>) => V;
    arguments: ast.ASTNode[];
    signature: Signature;
    // TODO: Fix this...how is a function getting in here?
    body: ast.ASTNode | Function;
    // Cam from a lambda expression that contained no
    // arguments.  Not entirely sure why this is necessary.
    thunk: boolean;
}

export interface FunctionDetails {
    implementation: Function;
    signature: Signature;
}
