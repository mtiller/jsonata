import { JBox } from "./box";
import { JEnv } from "./environment";
import * as ast from "../ast";
import { Signature } from "../signatures";

export interface ProcedureDetails {
    input: JBox;
    environment: JEnv;
    arguments: ast.ASTNode[];
    signature: Signature;
    body: ast.ASTNode;
    thunk: boolean;
}
