#include <stdio.h>
int calls = 0;
int bump() { calls++; return 1; }
int main() {
  int a = 0;
  if (a && bump()) printf("no\n");
  if (a || bump()) printf("yes\n");
  int x = (a, 5);
  int y = x > 3 ? x * 2 : x - 2;
  printf("%d %d %d\n", x, y, calls);
  printf("%d\n", !5 + !0);
  return 0;
}
