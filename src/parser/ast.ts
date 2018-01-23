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
    lhs: ASTNode;
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

export interface UnaryMinusNode extends BaseNode {
    type: "unary";
    value: "-";
    expression: ASTNode;
}

export interface ArrayConstructorNode extends BaseNode {
    type: "unary";
    value: "[";
    expressions: ASTNode[];
}

export interface UnaryObjectNode extends BaseNode {
    type: "unary";
    value: "{";
    lhs: ASTNode[][];
}

export type UnaryNode = UnaryMinusNode | ArrayConstructorNode | UnaryObjectNode;

export interface BinaryNode extends BaseNode {
    type: "binary";
    value: "+" | "-" | "*" | "/" | "[" | ".." | "." | "[" | ":=" | "~>"; // TODO: There must be more?!? (e.g., comparisons)
    lhs: ASTNode;
    rhs: ASTNode; // ASTNode if operator is "." | "[" | ":=" | "~>", ASTNode[] if operator is "{" | "^"
}

export interface BinaryObjectNode extends BaseNode {
    type: "binary";
    value: "{" 
    lhs: ASTNode;
    rhs: ASTNode[]; // ASTNode[] if operator is "{"
}

export interface SortTerm {
    descending: boolean;
    expression: ASTNode;
}

export interface SortNode extends BaseNode {
    type: "sort";
    lhs: ASTNode;
    rhs: SortTerm[];
}

export interface TernaryNode extends BaseNode {
    type: "condition";
    condition: ASTNode;
    then: ASTNode;
    else: ASTNode;
    position: number;
}

export interface BlockNode extends BaseNode {
    type: "block";
    expressions: ASTNode[];
}

export interface TransformNode extends BaseNode {
    type: "transform";
    pattern: ASTNode;
    update: ASTNode;
    delete?: ASTNode;
}

export interface FunctionInvocationNode extends BaseNode {
    type: "function" | "partial";
    procedure: ASTNode;
    arguments: ASTNode[];
}

export interface LambdaDefinitionNode extends BaseNode {
    type: "lambda";
    body: ASTNode;
    signature: Signature;
    procedure: ASTNode;
    arguments: ASTNode[];
}

// This type of node only appears after the AST is optimized
export interface PathNode extends BaseNode {
    type: "path";
    steps: ASTNode[];
    keepSingletonArray?: boolean,
}

export interface BindNode extends BaseNode {
    type: "bind";
    lhs: ASTNode;
    rhs: ASTNode;
}

export interface ApplyNode extends BaseNode {
    type: "apply";
    lhs: ASTNode;
    rhs: ASTNode;
}

/**
 * These are the AST nodes that come directly out of the parser before
 * ast_optimize is called.
 */
export type ASTNode =
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
    | BinaryObjectNode
    | SortNode
    | TernaryNode
    | BlockNode
    | TransformNode
    | FunctionInvocationNode
    | LambdaDefinitionNode
    | PathNode
    | BindNode
    | ApplyNode
    | EndNode;

