#include <stdio.h>
int main() {
  printf("[%5d][%-5d][%05d]\n", 42, 42, 42);
  printf("[%x][%X][%o][%c]\n", 255, 255, 8, 'A');
  printf("[%.2f][%8.3f][%e]\n", 3.14159, 2.5, 1234.5);
  printf("[%s][%10s][%-10s]\n", "hi", "hi", "hi");
  printf("%d%%\n", 50);
  printf("%u\n", 4000000000u);
  return 0;
}
