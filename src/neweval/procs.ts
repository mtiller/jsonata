import { Box } from "./box";
import { JEnv } from "./environment";
import * as ast from "../ast";
import { Signature } from "../signatures";
import { EvaluationOptions } from "./options";

export interface ProcedureDetails {
    input: Box;
    environment: JEnv;
    options: EvaluationOptions;
    arguments: ast.ASTNode[];
    signature: Signature;
    body: ast.ASTNode | Function;
    thunk: boolean;
}

export interface FunctionDetails {
    implementation: Function;
    signature: Signature;
}
