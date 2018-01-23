import * as ast from "./ast";
import { Token } from "../tokenizer";
export type NUD = (state: ParserState) => ast.RawASTNode;
export type LED = (state: ParserState, left: ast.RawASTNode) => ast.RawASTNode;

export interface Symbol {
    id: string;
    lbp: number;
    nud: NUD;
    led?: LED;
    position?: number;
    value: any;
}

export interface ParserState {
    readonly symbol: Symbol;
    readonly previousToken: Token;
    readonly token: Token;
    readonly error: any;
    advance: (id?: string, infix?: boolean) => void;
    expression: (rbp: number) => ast.RawASTNode;
    handleError: (err) => void;
}

export type SymbolTable = { [id: string]: Symbol };

export type ErrorCollector = (err: any) => void;