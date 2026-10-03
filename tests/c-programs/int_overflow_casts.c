#include <stdio.h>
int main() {
  unsigned char c = 250;
  c = c + 10;
  printf("%d\n", c);
  unsigned int u = 0;
  u = u - 1;
  printf("%u\n", u);
  short s = (short)70000;
  printf("%d\n", s);
  int big = 2147483647;
  unsigned int w = (unsigned int)big + 1u;
  printf("%u\n", w);
  printf("%d\n", (int)3.99);
  printf("%d\n", (int)-3.99);
  char ch = (char)321;
  printf("%d\n", ch);
  return 0;
}
