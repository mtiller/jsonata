import { ASTNode } from './index';

// Potential AST changes
//
//   - Make predicate and group into AST nodes instead of optional fields on every node.
//   - Change unary operator "[" to a different type...?
//   - Get errors? off of BaseNode
//   - Rationalize unary nodes

export interface BaseNode {
    type: string;
    value: any;
    position: number;
    // This gets added to nodes to indicate how a value (assuming it is an object)
    // should be grouped.
    // This gets added to nodes to specify a list of predicates to filter on.
    predicate?: ASTNode[];
    // TODO: Figure out exactly what this is
    nextFunction?: any;
}

