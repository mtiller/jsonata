# Debugging from Visual Studio Code

If you want to debug the code, the simplest way to achieve this is to use Visual Studio Code.
The include `.vscode` directory includes a `launch.json` configuration file that knows how
to run `jest` from the debugger.  All you need to do is set a breakpoint anywhere in the 
TypeScript code and it should stop there when running the `jest` tests.

## Running specific test cases

You can configure which tests `jest` runs using command line flags.  If you want to run `jest`
from the command line on specific tests, you can simply execute the command:

```
$ yarn jest -t <string>
```

...and `jest` will only run tests whose description includes `<string>`.  If you want to
**debug** such tests, you'll need to go into `.vscode` and edit the configuration named
`"Debug Tests Matching..."`.  Look for the string that follows the `-t` argument in
order to specify the term you are interested in.

## Not stopping at some breakpoints

I've seen issues where you set a breakpoint on a given line and the debugger doesn't stop.
But you set it on another line close by and it does.  I have to assume this has something
to do with how it maps back and forth between the TypeScript code and the generated 
Javascript code.  I'm not sure what to do about it except for trying different lines.