#include <stdio.h>
struct P { int x; int y; };
struct Box { struct P a; int arr[3]; };
int main() {
  struct Box b = { {1, 2}, {7, 8, 9} };
  struct Box c = b;
  c.a.x = 100;
  c.arr[1] = 55;
  printf("%d %d %d\n", b.a.x, b.arr[1], b.arr[2]);
  printf("%d %d %d\n", c.a.x, c.arr[1], c.arr[2]);
  return 0;
}
