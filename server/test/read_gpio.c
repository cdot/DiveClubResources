// Read from GPIO 9 (wiringPi 13)
#include <wiringPi.h>
#include <stdio.h>
#include <stdlib.h>
#include <stdint.h>

int main(int argc, char** argv) {
  if (wiringPiSetupGpio() == -1)
    exit(1);

  int pin = atoi(argv[1]);
  pinMode(pin, INPUT);
  pullUpDnControl(pin, PUD_DOWN);

  printf("pin %d configured %d\n", pin, PUD_DOWN);

  while (1) {
    printf("%d\n", digitalRead(pin));
  }
}

