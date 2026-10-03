#include <stdio.h>
int main() {
  printf("%d %d\n", 7 / 2, 7 % 2);
  printf("%d %d\n", -7 / 2, -7 % 2);
  printf("%d %d\n", 7 / -2, 7 % -2);
  printf("%d %d\n", -7 / -2, -7 % -2);
  printf("%d\n", -8 >> 1);
  printf("%d\n", 1 << 10);
  return 0;
}
