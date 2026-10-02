export interface Lesson {
  /** one-paragraph idea behind the program */
  idea: string;
  /** ideas this program is meant to teach */
  concepts: string[];
  /** concrete things to look for while stepping */
  watch: string[];
  /** common mistakes related to the topic */
  pitfalls: string[];
  /** experiments to try after the first run */
  tryIt: string[];
  /** typical exam-style complexity / property, when relevant */
  complexity?: string;
}

/** Teaching notes keyed by example name (see lib/examples.ts). */
export const LESSONS: Record<string, Lesson> = {
  "Variables & types": {
    idea: "Every variable is a named box of memory with a fixed type. The type decides how many bytes it takes and how its bits are read.",
    concepts: ["Declaration vs. assignment", "Type sizes (int = 4 bytes, char = 1, double = 8)", "chars are small integers"],
    watch: [
      "Each variable shows its own address and size in the Memory view.",
      "`grade = grade + 1` turns 'A' into 'B': a char is just the number 65 + 1.",
      "A variable that is declared but not yet assigned shows as uninitialised.",
    ],
    pitfalls: ["Reading a variable before giving it a value gives garbage.", "Integer division drops the decimals (7 / 2 is 3)."],
    tryIt: ["Change `age + 1` to `age / 2` and predict the result.", "Add `char c = 66;` and print it with %c and then %d."],
  },
  "Arrays & pointers": {
    idea: "An array is a row of same-typed boxes side by side. A pointer is a variable that stores the address of another box.",
    concepts: ["Array indexing starts at 0", "Pointer holds an address", "Pointer arithmetic moves in units of the pointed-to type", "Dereference with *"],
    watch: [
      "Addresses of nums[0], nums[1]… differ by exactly 4 bytes (sizeof(int)).",
      "`p = p + 1` moves the pointer by one int, not by one byte.",
      "`*p = 7` changes the array element, because p points into the array.",
    ],
    pitfalls: ["`nums[5]` on a 5-element array is out of bounds.", "Confusing `p` (the address) with `*p` (the value there)."],
    tryIt: ["Print `*(p + 2)` and compare with nums[2].", "Make p walk the array with a for loop."],
  },
  "Swap with pointers": {
    idea: "C passes arguments by value: a function gets copies. To let a function change the caller's variables, pass their addresses.",
    concepts: ["Pass by value", "Address-of operator &", "Dereferencing to modify the caller's data", "Stack frames"],
    watch: [
      "While inside swap(), two frames are on the stack; a and b hold the addresses of x and y.",
      "`tmp` lives only in swap's frame and disappears when it returns.",
      "x and y in main change even though main never assigns to them directly.",
    ],
    pitfalls: ["Writing `swap(x, y)` instead of `swap(&x, &y)`.", "Writing `a = b` instead of `*a = *b` only changes the local pointer copy."],
    tryIt: ["Rewrite swap to take plain ints and observe that x and y never change."],
  },
  "Loop & sum": {
    idea: "A for loop is shorthand for: initialise, test, run the body, update, repeat. Watching the condition steps makes the control flow concrete.",
    concepts: ["Loop variable", "Accumulator pattern", "Off-by-one boundaries (< vs <=)"],
    watch: [
      "Every iteration shows a 'for condition' step followed by the body, then the i++ update.",
      "`total` grows 1, 3, 6, 10, 15 (triangular numbers).",
      "The Stats tab shows the loop body ran exactly 5 times.",
    ],
    pitfalls: ["Using < instead of <= and missing the last item.", "Forgetting to update the loop variable in a while loop causes an infinite loop."],
    tryIt: ["Change the condition to `i < 5` and check the sum.", "Sum only even numbers using `if (i % 2 == 0)`."],
    complexity: "O(n): the body runs once per element.",
  },
  Recursion: {
    idea: "A recursive function calls itself on a smaller problem until it reaches a base case. Each call gets its own stack frame with its own n.",
    concepts: ["Base case and recursive case", "Call stack growth and unwinding", "Each frame has independent local variables"],
    watch: [
      "The frame list grows to four factorial() frames, then shrinks as each returns.",
      "Nothing is multiplied until the calls start returning: 1, then 2*1, 3*2, 4*6.",
      "The Stats tab reports the maximum stack depth.",
    ],
    pitfalls: ["No base case means infinite recursion and stack overflow.", "Recursing on a value that does not get smaller."],
    tryIt: ["Call factorial(6) and compare the depth.", "Remove the base case to see the interpreter stop the runaway recursion."],
    complexity: "O(n) time and O(n) stack space.",
  },
  Strings: {
    idea: "C has no string type. A string is a char array whose end is marked by the character '\\0' (value 0).",
    concepts: ["Null terminator", "Array size must include the terminator", "strlen vs. buffer size", "Library string functions"],
    watch: [
      "The array of 10 chars holds 'H','e','l','l','o','\\0' and then unused slots.",
      "strcat writes at the old terminator and adds a new one after '!'.",
      "strlen counts characters up to, not including, '\\0'.",
    ],
    pitfalls: ["`char s[5] = \"Hello\"` leaves no room for '\\0'.", "strcat into a buffer that is too small overflows it."],
    tryIt: ["Shrink the array to 6 and see where strcat breaks.", "Replace a letter with 0 and print the string."],
  },
  Structs: {
    idea: "A struct bundles related values into one unit. Fields sit next to each other in memory, and the arrow operator accesses them through a pointer.",
    concepts: ["Struct layout", "Dot vs. arrow operator", "Passing a pointer to avoid copying", "Pass by reference via pointer"],
    watch: [
      "The struct is shown as a table of fields with their values.",
      "`p->x` is shorthand for `(*p).x`.",
      "move() changes the caller's struct because it received its address.",
    ],
    pitfalls: ["Using `.` on a pointer or `->` on a plain struct.", "Assuming the struct size is the sum of field sizes (padding may be added)."],
    tryIt: ["Add a `char tag;` field between x and y and look at the sizes and addresses."],
  },
  "malloc & free": {
    idea: "Local variables live on the stack and vanish with their function. malloc reserves memory on the heap that stays until you free it.",
    concepts: ["Stack vs. heap", "sizeof", "Every malloc needs a matching free", "A pointer on the stack points to a block on the heap"],
    watch: [
      "A heap block appears when malloc runs, and arr (on the stack) points to it.",
      "After free() the block is marked freed.",
      "Remove the free() call: the run finishes with a memory-leak warning.",
    ],
    pitfalls: ["Forgetting free (leak).", "Using memory after free.", "Freeing the same block twice."],
    tryIt: ["Delete `free(arr)` and read the leak warning.", "Allocate with calloc and compare initial contents."],
  },
  "Linked list": {
    idea: "A linked list stores each value in its own heap node with a pointer to the next one. The list is just a chain of pointers.",
    concepts: ["Self-referential structs", "Dynamic allocation per node", "Traversal with a cursor pointer", "Freeing a list safely"],
    watch: [
      "push() puts the new node in front, so values appear in reverse: 1 -> 2 -> 3.",
      "The traversal's `cur` pointer hops from node to node until it is NULL.",
      "In the free loop, `next` is saved before free(head); otherwise the pointer would be lost.",
    ],
    pitfalls: ["Losing the head pointer leaks the whole list.", "Reading `head->next` after freeing head."],
    tryIt: ["Swap the order of the free loop lines and watch it fail.", "Write an append function that adds to the tail."],
    complexity: "push is O(1); traversal is O(n).",
  },
  "Bubble sort": {
    idea: "Repeatedly compare neighbours and swap them if out of order. After each pass the largest remaining value 'bubbles' to the end.",
    concepts: ["Nested loops", "Swap using a temporary", "Invariant: after pass k the last k items are in place"],
    watch: [
      "The highlighted cells in the array show the pair being compared and swapped.",
      "After the first outer pass, 9 is in the last position.",
      "The heatmap/Stats tab shows the inner comparison running 10 times.",
    ],
    pitfalls: ["Swapping without tmp loses a value.", "Wrong inner bound reads past the array."],
    tryIt: ["Start with an already sorted array and count the comparisons.", "Add a `swapped` flag to stop early."],
    complexity: "O(n²) comparisons in the worst and average case.",
  },
  "2D array": {
    idea: "A 2D array is an array of rows. grid[r][c] means 'row r, then column c', and rows are stored one after another in memory.",
    concepts: ["Row-major layout", "Nested loops over rows and columns", "Two indexes"],
    watch: ["Cells are visited row by row: 1,2,3 then 4,5,6.", "The outer loop variable r changes slowly, the inner c quickly."],
    pitfalls: ["Swapping row and column bounds.", "Forgetting that both indexes start at 0."],
    tryIt: ["Sum column by column by swapping the loops.", "Add a third row and update the bounds."],
    complexity: "O(rows × cols).",
  },
  "Reading input (scanf)": {
    idea: "scanf stores what the user typed into the memory you point it at, which is why you must pass &n.",
    concepts: ["Standard input", "Format specifiers (%d)", "Address-of in scanf", "Programs waiting for input"],
    watch: ["Execution pauses at scanf until you type a value in the input box.", "n changes from uninitialised to your number."],
    pitfalls: ["Forgetting the & before n.", "Using the wrong specifier (%f for an int)."],
    tryIt: ["Type a letter instead of a number and see scanf fail.", "Read two numbers and print their sum."],
  },
  "Function pointers": {
    idea: "Functions have addresses too. A function pointer lets you choose which function to call at run time.",
    concepts: ["Function pointer syntax", "Callbacks", "Higher-order functions in C"],
    watch: ["`op` holds the address of add or mul, depending on the call.", "`op(x, y)` calls whichever function it points to."],
    pitfalls: ["Mismatched signatures between the pointer type and the function."],
    tryIt: ["Add a `sub` function and call apply with it."],
  },
  "Bug: out of bounds": {
    idea: "C does not stop you from reading past the end of an array. The visualizer does, so you can see exactly where the bug is.",
    concepts: ["Array bounds", "Undefined behaviour", "Off-by-one error"],
    watch: ["The loop runs i = 0, 1, 2, 3, and the fourth read is flagged.", "The condition `i <= 3` is the culprit; valid indexes are 0 to 2."],
    pitfalls: ["Real C would print garbage or crash, silently."],
    tryIt: ["Fix the condition to `i < 3`.", "Use sizeof(scores) / sizeof(scores[0]) for the length."],
  },
  "Bug: use after free": {
    idea: "After free(p), the pointer still holds the old address but the block no longer belongs to you. Using it is undefined behaviour.",
    concepts: ["Dangling pointer", "Lifetime of heap memory", "Set pointers to NULL after free"],
    watch: ["The heap block turns 'freed' while p still points to it.", "The final printf is flagged as an invalid read."],
    pitfalls: ["Code like this often appears to work, which makes the bug hard to find."],
    tryIt: ["Set `p = NULL;` after free and check the pointer before using it."],
  },

  /* ---- new examples ---- */
  "Binary search": {
    idea: "On a sorted array, look at the middle element and throw away half the range each time. That is why it is so much faster than scanning.",
    concepts: ["Divide and conquer", "Loop invariant: the target, if present, is within [lo, hi]", "Midpoint calculation"],
    watch: ["lo and hi close in on each other every iteration.", "The range halves: 8 -> 4 -> 2 -> 1 elements.", "Compare the number of steps with a linear search on the same data."],
    pitfalls: ["The array must be sorted.", "`lo + (hi - lo) / 2` avoids integer overflow of `(lo + hi) / 2`.", "Wrong bounds give infinite loops."],
    tryIt: ["Search for a value that is not in the array.", "Search for the first and last elements."],
    complexity: "O(log n).",
  },
  "Selection sort": {
    idea: "Find the smallest remaining element and move it to the front of the unsorted part. Exactly one swap per pass.",
    concepts: ["Nested loops", "Tracking an index of the minimum", "Sorted prefix grows by one each pass"],
    watch: ["`min` is an index, not a value.", "Only one swap per outer iteration, unlike bubble sort.", "The left part of the array is final after each pass."],
    pitfalls: ["Swapping values instead of tracking the index of the smallest."],
    tryIt: ["Compare the number of line executions with bubble sort in the Stats tab."],
    complexity: "O(n²) comparisons but only O(n) swaps.",
  },
  "Stack with array": {
    idea: "A stack is last-in, first-out. Here it is a fixed array plus an integer `top` that says how many items are stored.",
    concepts: ["LIFO order", "Abstract data type vs. implementation", "Struct holding an array and a counter", "Overflow/underflow checks"],
    watch: ["push writes at index top and then increments it.", "pop decrements top first; the old value stays in memory but is no longer part of the stack.", "Items come out in reverse order."],
    pitfalls: ["Popping from an empty stack (underflow).", "Pushing into a full stack (overflow)."],
    tryIt: ["Add a peek() function.", "Use the stack to reverse a string."],
    complexity: "push and pop are O(1).",
  },
  "Binary search tree": {
    idea: "Each node has a left child with smaller values and a right child with larger ones. Insertion follows one path from the root, which makes lookups fast.",
    concepts: ["Recursion on a linked structure", "Heap-allocated nodes", "Ordering invariant", "In-order traversal visits values sorted"],
    watch: ["Each insert call recurses left or right depending on the comparison.", "Node pointers connect heap blocks into a tree.", "In-order traversal prints 1 3 5 7 9."],
    pitfalls: ["Forgetting to return the (possibly new) root from insert.", "An unbalanced tree degrades to a linked list."],
    tryIt: ["Insert the numbers in sorted order and see the degenerate tree.", "Write a function to compute the height."],
    complexity: "Average O(log n) per operation; worst case O(n).",
  },
  "Fibonacci": {
    idea: "The same sequence computed two ways. Recursion repeats a lot of work, while a loop keeps only the last two values.",
    concepts: ["Recursion vs. iteration", "Redundant recomputation", "Trade-offs in time and stack space"],
    watch: ["fib_rec(5) makes many repeated calls, such as fib_rec(2) several times.", "The Stats tab shows the number of calls for each approach.", "The loop version needs only a, b and next."],
    pitfalls: ["Naive recursion is exponential for large n."],
    tryIt: ["Raise n to 7 and compare the call counts.", "Add a memo array to cache results."],
    complexity: "Recursive: O(2ⁿ). Iterative: O(n).",
  },
  "Pointer arithmetic": {
    idea: "Arrays and pointers are closely related: `a[i]` is exactly `*(a + i)`. A string can be walked with a pointer until '\\0'.",
    concepts: ["Pointer arithmetic", "Array-to-pointer decay", "Walking a string", "Pointer difference"],
    watch: ["`p` advances one char at a time and the loop stops at '\\0'.", "`end - s` is the number of elements between two pointers.", "Addresses go up by sizeof(type)."],
    pitfalls: ["Moving a pointer outside the array.", "Forgetting that pointer arithmetic scales by the element size."],
    tryIt: ["Write your own strlen with the pointer difference.", "Walk the array backwards."],
  },
  "Bit manipulation": {
    idea: "Integers are patterns of bits. Bitwise operators let you test, set, clear and flip individual bits.",
    concepts: ["AND, OR, XOR, NOT", "Shifts", "Bit masks", "Powers of two"],
    watch: ["`1 << 3` is 8, one bit moved three places.", "x & 1 tests whether a number is odd.", "The loop counts the set bits of a number."],
    pitfalls: ["Mixing up & and &&.", "Shifting by a negative or too-large amount is undefined."],
    tryIt: ["Clear bit 2 with `x & ~(1 << 2)`.", "Check whether a number is a power of two with `x & (x - 1)`."],
  },
  "Bug: memory leak": {
    idea: "Memory that is allocated and never freed is lost for the rest of the program. In a long-running program this eventually exhausts memory.",
    concepts: ["Memory leak", "Ownership of allocated memory", "Overwriting the only pointer to a block"],
    watch: ["The second malloc overwrites `p`, so the first block has no pointer to it.", "At the end the run reports the blocks that were never freed."],
    pitfalls: ["Reassigning a pointer before freeing what it points to."],
    tryIt: ["Add `free(p);` before the second malloc and compare the final warning."],
  },
};
