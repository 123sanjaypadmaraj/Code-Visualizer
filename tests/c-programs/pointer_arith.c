#include <stdio.h>
int main() {
  int a[5] = {10, 20, 30, 40, 50};
  int *p = a;
  int *q = a + 4;
  printf("%d %d\n", *(p + 2), *q);
  printf("%d\n", (int)(q - p));
  p += 3;
  printf("%d %d\n", *p, p[-1]);
  char s[] = "hello";
  char *t = s;
  while (*t) t++;
  printf("%d\n", (int)(t - s));
  return 0;
}
