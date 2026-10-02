export interface Example {
  name: string;
  blurb: string;
  code: string;
  stdin?: string;
  /** deliberately broken program that ends in a runtime error */
  bug?: boolean;
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
];

export const STARTER = EXAMPLES[1].code;
