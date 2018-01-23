import { Token } from "../tokenizer";
import { Signature } from '../signatures';

export interface BaseNode {
    type: string;
    value: any;
    position: number;
    keepArray?: boolean;
    // TODO: This is only added to the root expression node...should probably be a separate return value from parser
    errors?: string[];
}

export interface WildcardNode extends BaseNode {
    type: "wildcard";
}

export interface DescendantNode extends BaseNode {
    type: "descendant";
}

export interface ErrorFields {
    code: string;
}

export interface ErrorNode extends BaseNode {
    type: "error";
    error: ErrorFields;
    lhs: RawASTNode;
    remaining: Token[];
}

export interface VariableNode extends BaseNode {
    type: "variable";
}

export interface NameNode extends BaseNode {
    type: "name";
}
export interface LiteralNode extends BaseNode {
    type: "literal";
}

export interface RegexNode extends BaseNode {
    type: "regex";
}

export interface OperatorNode extends BaseNode {
    type: "operator";
}

export interface EndNode extends BaseNode {
    type: "end";
    value: string;
}

export type TerminalNode = VariableNode | NameNode | LiteralNode | RegexNode | OperatorNode | EndNode;

export interface UnaryNode extends BaseNode {
    type: "unary";
    expression?: RawASTNode;
    lhs?: RawASTNode[];
    expressions?: RawASTNode[];
    position: number;
}

export interface BinaryNode extends BaseNode {
    type: "binary";
    value: "+" | "[" | ".." | "." | "[" | ":=" | "~>" | "{" | "^" // TODO: There must be more?!?
    lhs: RawASTNode;
    rhs: RawASTNode | RawASTNode[]; // ASTNode if operator is "." | "[" | ":=" | "~>", ASTNode[] if operator is "{" | "^"
}

export interface SortTerm {
    descending: boolean;
    expression: RawASTNode;
}

export interface SortNode extends BaseNode {
    type: "sort";
    lhs: RawASTNode;
    rhs: SortTerm[];
}

export interface TernaryNode extends BaseNode {
    type: "condition";
    condition: RawASTNode;
    then: RawASTNode;
    else: RawASTNode;
    position: number;
}

export interface BlockNode extends BaseNode {
    type: "block";
    expressions: RawASTNode[];
}

export interface TransformNode extends BaseNode {
    type: "transform";
    pattern: RawASTNode;
    update: RawASTNode;
    delete?: RawASTNode;
}

export interface FunctionInvocationNode extends BaseNode {
    type: "function" | "partial";
    procedure: RawASTNode;
    arguments: RawASTNode[];
}

export interface LambdaDefinitionNode extends BaseNode {
    type: "lambda";
    body: RawASTNode;
    signature: Signature;
    procedure: RawASTNode;
    arguments: RawASTNode[];
}

/**
 * These are the AST nodes that come directly out of the parser before
 * ast_optimize is called.
 */
export type RawASTNode =
    | WildcardNode
    | DescendantNode
    | ErrorNode
    | LiteralNode
    | NameNode
    | VariableNode
    | RegexNode
    | OperatorNode
    | UnaryNode
    | BinaryNode
    | SortNode
    | TernaryNode
    | BlockNode
    | TransformNode
    | FunctionInvocationNode
    | LambdaDefinitionNode
    | EndNode;

// TODO: Add synthetic ast nodes (rename ASTNode to RawAstNode or something)
export type OptimizedASTNode = RawASTNode;