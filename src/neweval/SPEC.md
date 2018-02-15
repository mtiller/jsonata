# JSONata Evaluation Specification

This document describes the evaluation semantics of JSONata.  For the purposes
of this document, we assume the data value that the expression is being applied
to is an ordinary JSON object.  But the evaluation semantics could be applied
to other data sources (*e.g.,* `Promise`s, `Observable`s, `WebSocket`s, *etc.*).
Defining the semantics for other sources should be quite straightforward as
long as those evaluation semantics can build on top of these.

## Input and Output Processing

### Input Data

Before discussing the actual evaluation semantics, it is worth taking a moment
to talk about how the input data is prepared.  In the following sections, we will
assume that the evaluation of the JSONata expression is performed on values
contained in an array.

In practice, what this means is that any input data that is not an array is
transformed into a *singleton array* an array with only one element.

### Output Data

Under most circumstances, the processing that is applied to input data is 
reversed in generating output data.  What this means is that if the result
of a JSONata evaluation is a singleton array, the sole value in the array
will be returned.

## Environment

## Evaluating Nodes

### Literals

Evaluation of a literal node is perhaps the simplest of all nodes.  Each literal node
in the AST has a value associated with it.  This value must be one of ___.

## Errors
