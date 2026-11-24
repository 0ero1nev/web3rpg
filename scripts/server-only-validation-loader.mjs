import { registerHooks } from "node:module";

// --import does not auto-register exported hooks, so register explicitly. The
// stub keeps `import "server-only"` working outside the Next.js runtime.
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "server-only") {
      return {
        url: "data:text/javascript,export default {};",
        shortCircuit: true,
      };
    }
    return nextResolve(specifier, context);
  },
});
