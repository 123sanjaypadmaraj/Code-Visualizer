export interface Example {
  name: string;
  blurb: string;
  code: string;
  stdin?: string;
  /** deliberately broken program that ends in a runtime error */
  bug?: boolean;
  /** runs to completion but leaks heap memory (reported as a warning) */
  leak?: boolean;
}

export const EXAMPLES: Example[] = [
  {
    name: "Variables & types",
    blurb: "How int, float and char live in memory",
    code: `#include <stdio.h>

int main() {
    int age = 21;
    float height = 1.75f;
    char grade = 'A';
    double pi = 3.14159;

    age = age + 1;
    grade = grade + 1;

    printf("Age: %d, grade: %c\\n", age, grade);
    return 0;
}
`,
  },
  {
    name: "Arrays & pointers",
    blurb: "A pointer walking through an array",
    code: `#include <stdio.h>

int main() {
    int nums[5] = {10, 20, 30, 40, 50};
    nums[2] = 99;

    int *p = &nums[0];
    p = p + 1;
    printf("%d\\n", *p);
    *p = 7;

    return 0;
}
`,
  },
  {
    name: "Swap with pointers",
    blurb: "Why swap() needs addresses",
    code: `#include <stdio.h>

void swap(int *a, int *b) {
    int tmp = *a;
    *a = *b;
    *b = tmp;
}

int main() {
    int x = 5;
    int y = 9;
    swap(&x, &y);
    printf("x=%d y=%d\\n", x, y);
    return 0;
}
`,
  },
  {
    name: "Loop & sum",
    blurb: "Step through a for loop",
    code: `#include <stdio.h>

int main() {
    int total = 0;
    for (int i = 1; i <= 5; i++) {
        total = total + i;
    }
    printf("Sum = %d\\n", total);
    return 0;
}
`,
  },
  {
    name: "Recursion",
    blurb: "Watch the call stack grow and unwind",
    code: `#include <stdio.h>

int factorial(int n) {
    if (n <= 1) {
        return 1;
    }
    return n * factorial(n - 1);
}

int main() {
    int result = factorial(4);
    printf("4! = %d\\n", result);
    return 0;
}
`,
  },
  {
    name: "Strings",
    blurb: "A string is a char array ending in '\\0'",
    code: `#include <stdio.h>
#include <string.h>

int main() {
    char name[10] = "Hello";
    name[0] = 'J';
    strcat(name, "!");
    printf("%s has %d letters\\n", name, (int)strlen(name));
    return 0;
}
`,
  },
  {
    name: "Structs",
    blurb: "Group related values together",
    code: `#include <stdio.h>

struct Point {
    int x;
    int y;
};

void move(struct Point *p, int dx, int dy) {
    p->x = p->x + dx;
    p->y = p->y + dy;
}

int main() {
    struct Point p = {3, 4};
    move(&p, 10, -2);
    printf("(%d, %d)\\n", p.x, p.y);
    return 0;
}
`,
  },
  {
    name: "malloc & free",
    blurb: "Heap memory you manage yourself",
    code: `#include <stdio.h>
#include <stdlib.h>

int main() {
    int *arr = malloc(3 * sizeof(int));
    arr[0] = 7;
    arr[1] = 8;
    arr[2] = 9;
    printf("%d\\n", arr[1]);
    free(arr);
    return 0;
}
`,
  },
  {
    name: "Linked list",
    blurb: "Nodes on the heap joined by pointers",
    code: `#include <stdio.h>
#include <stdlib.h>

typedef struct Node {
    int value;
    struct Node *next;
} Node;

Node *push(Node *head, int value) {
    Node *n = malloc(sizeof(Node));
    n->value = value;
    n->next = head;
    return n;
}

int main() {
    Node *head = NULL;
    head = push(head, 3);
    head = push(head, 2);
    head = push(head, 1);

    int sum = 0;
    for (Node *cur = head; cur != NULL; cur = cur->next) {
        sum += cur->value;
    }
    printf("sum = %d\\n", sum);

    while (head != NULL) {
        Node *next = head->next;
        free(head);
        head = next;
    }
    return 0;
}
`,
  },
  {
    name: "Bubble sort",
    blurb: "Sorting an array with swaps",
    code: `#include <stdio.h>

int main() {
    int a[5] = {5, 2, 9, 1, 6};
    int n = 5;

    for (int i = 0; i < n - 1; i++) {
        for (int j = 0; j < n - 1 - i; j++) {
            if (a[j] > a[j + 1]) {
                int tmp = a[j];
                a[j] = a[j + 1];
                a[j + 1] = tmp;
            }
        }
    }

    for (int i = 0; i < n; i++) {
        printf("%d ", a[i]);
    }
    printf("\\n");
    return 0;
}
`,
  },
  {
    name: "2D array",
    blurb: "A matrix is an array of arrays",
    code: `#include <stdio.h>

int main() {
    int grid[2][3] = {{1, 2, 3}, {4, 5, 6}};
    int sum = 0;
    for (int r = 0; r < 2; r++) {
        for (int c = 0; c < 3; c++) {
            sum += grid[r][c];
        }
    }
    printf("sum = %d\\n", sum);
    return 0;
}
`,
  },
  {
    name: "Reading input (scanf)",
    blurb: "Uses the Input box below the code",
    stdin: "7",
    code: `#include <stdio.h>

int main() {
    int n;
    printf("Enter a number: ");
    scanf("%d", &n);
    int square = n * n;
    printf("%d squared is %d\\n", n, square);
    return 0;
}
`,
  },
  {
    name: "Function pointers",
    blurb: "Pass a function like a value",
    code: `#include <stdio.h>

int add(int a, int b) { return a + b; }
int mul(int a, int b) { return a * b; }

int apply(int (*op)(int, int), int x, int y) {
    return op(x, y);
}

int main() {
    printf("%d\\n", apply(add, 3, 4));
    printf("%d\\n", apply(mul, 3, 4));
    return 0;
}
`,
  },
  {
    name: "Bug: out of bounds",
    blurb: "See how the visualizer catches a classic crash",
    bug: true,
    code: `#include <stdio.h>

int main() {
    int scores[3] = {90, 80, 70};
    for (int i = 0; i <= 3; i++) {
        printf("%d\\n", scores[i]);
    }
    return 0;
}
`,
  },
  {
    name: "Bug: use after free",
    blurb: "A dangling pointer in action",
    bug: true,
    code: `#include <stdio.h>
#include <stdlib.h>

int main() {
    int *p = malloc(sizeof(int));
    *p = 42;
    free(p);
    printf("%d\\n", *p);
    return 0;
}
`,
  },
  {
    name: "Binary search",
    blurb: "Halve the search range every step",
    code: `#include <stdio.h>

int main() {
    int a[8] = {2, 5, 8, 12, 16, 23, 38, 56};
    int target = 23;
    int lo = 0;
    int hi = 7;
    int found = -1;

    while (lo <= hi) {
        int mid = lo + (hi - lo) / 2;
        if (a[mid] == target) {
            found = mid;
            break;
        } else if (a[mid] < target) {
            lo = mid + 1;
        } else {
            hi = mid - 1;
        }
    }
    printf("index = %d\\n", found);
    return 0;
}
`,
  },
  {
    name: "Selection sort",
    blurb: "Pick the minimum, swap it into place",
    code: `#include <stdio.h>

int main() {
    int a[6] = {29, 10, 14, 37, 13, 5};
    int n = 6;

    for (int i = 0; i < n - 1; i++) {
        int min = i;
        for (int j = i + 1; j < n; j++) {
            if (a[j] < a[min]) {
                min = j;
            }
        }
        int tmp = a[i];
        a[i] = a[min];
        a[min] = tmp;
    }

    for (int i = 0; i < n; i++) {
        printf("%d ", a[i]);
    }
    printf("\\n");
    return 0;
}
`,
  },
  {
    name: "Stack with array",
    blurb: "Last in, first out",
    code: `#include <stdio.h>

#define CAP 4

struct Stack {
    int data[CAP];
    int top;
};

void push(struct Stack *s, int v) {
    if (s->top == CAP) {
        printf("overflow\\n");
        return;
    }
    s->data[s->top] = v;
    s->top = s->top + 1;
}

int pop(struct Stack *s) {
    s->top = s->top - 1;
    return s->data[s->top];
}

int main() {
    struct Stack st = {{0, 0, 0, 0}, 0};
    push(&st, 10);
    push(&st, 20);
    push(&st, 30);
    printf("%d\\n", pop(&st));
    printf("%d\\n", pop(&st));
    return 0;
}
`,
  },
  {
    name: "Binary search tree",
    blurb: "Ordered nodes on the heap",
    code: `#include <stdio.h>
#include <stdlib.h>

typedef struct Node {
    int key;
    struct Node *left;
    struct Node *right;
} Node;

Node *insert(Node *root, int key) {
    if (root == NULL) {
        Node *n = malloc(sizeof(Node));
        n->key = key;
        n->left = NULL;
        n->right = NULL;
        return n;
    }
    if (key < root->key) {
        root->left = insert(root->left, key);
    } else {
        root->right = insert(root->right, key);
    }
    return root;
}

void inorder(Node *root) {
    if (root == NULL) {
        return;
    }
    inorder(root->left);
    printf("%d ", root->key);
    inorder(root->right);
}

void destroy(Node *root) {
    if (root == NULL) {
        return;
    }
    destroy(root->left);
    destroy(root->right);
    free(root);
}

int main() {
    Node *root = NULL;
    root = insert(root, 5);
    root = insert(root, 3);
    root = insert(root, 7);
    root = insert(root, 1);
    inorder(root);
    printf("\\n");
    destroy(root);
    return 0;
}
`,
  },
  {
    name: "Fibonacci",
    blurb: "Recursion vs. a simple loop",
    code: `#include <stdio.h>

int fib_rec(int n) {
    if (n < 2) {
        return n;
    }
    return fib_rec(n - 1) + fib_rec(n - 2);
}

int fib_loop(int n) {
    int a = 0;
    int b = 1;
    for (int i = 0; i < n; i++) {
        int next = a + b;
        a = b;
        b = next;
    }
    return a;
}

int main() {
    printf("%d\\n", fib_rec(5));
    printf("%d\\n", fib_loop(5));
    return 0;
}
`,
  },
  {
    name: "Pointer arithmetic",
    blurb: "a[i] is really *(a + i)",
    code: `#include <stdio.h>

int main() {
    int a[4] = {3, 6, 9, 12};
    int *p = a;
    int *end = a + 4;
    int sum = 0;

    while (p < end) {
        sum += *p;
        p++;
    }

    char word[] = "pointer";
    char *s = word;
    while (*s != '\\0') {
        s++;
    }
    printf("sum=%d len=%d\\n", sum, (int)(s - word));
    return 0;
}
`,
  },
  {
    name: "Bit manipulation",
    blurb: "Masks, shifts and counting set bits",
    code: `#include <stdio.h>

int main() {
    unsigned int x = 44;
    int bits = 0;
    unsigned int t = x;

    while (t != 0) {
        bits += t & 1;
        t = t >> 1;
    }

    unsigned int withBit0 = x | (1 << 0);
    unsigned int noBit2 = x & ~(1 << 2);
    unsigned int flipped = x ^ 15;

    printf("%d %u %u %u\\n", bits, withBit0, noBit2, flipped);
    return 0;
}
`,
  },
  {
    name: "Bug: memory leak",
    leak: true,
    blurb: "Lose the only pointer to a heap block",
    code: `#include <stdio.h>
#include <stdlib.h>

int main() {
    int *p = malloc(sizeof(int));
    *p = 1;
    p = malloc(sizeof(int));
    *p = 2;
    printf("%d\\n", *p);
    free(p);
    return 0;
}
`,
  },
];

export const STARTER = EXAMPLES[1].code;
