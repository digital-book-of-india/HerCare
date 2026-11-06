// Keys that have no business in JSON from our apps but are the building blocks of attacks:
//  - `$where`, `$ne`, ... : MongoDB operator injection
//  - `a.b` with a dot     : MongoDB path injection
//  - `__proto__`, `constructor`, `prototype` : prototype pollution
const UNSAFE_KEY = /^\$|\.|^(__proto__|constructor|prototype)$/;
const MAX_DEPTH = 20;

// Returns the first unsafe key found anywhere inside `root`, or null. Iterative, so a deeply
// nested payload cannot overflow the stack.
export const findUnsafeKey = (root) => {
  const stack = [[root, 0]];
  while (stack.length > 0) {
    const [value, depth] = stack.pop();
    if (value === null || typeof value !== 'object') continue;
    if (depth > MAX_DEPTH) return '(nested too deeply)';
    for (const [key, child] of Object.entries(value)) {
      if (UNSAFE_KEY.test(key)) return key;
      stack.push([child, depth + 1]);
    }
  }
  return null;
};
