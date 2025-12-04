// Read from DHT on GPIO pin

#include <wiringPi.h>
#include <stdio.h>
#include <stdlib.h>
#include <stdint.h>
#define MAXTIMINGS	85

int dht11_dat[5] = { 0, 0, 0, 0, 0 };

void sample(pin) {
  uint8_t laststate = HIGH;
  uint8_t counter = 0;
  uint8_t j = 0, i;

  dht11_dat[0] = dht11_dat[1] = dht11_dat[2] = dht11_dat[3] = dht11_dat[4] = 0;

  pinMode(pin, OUTPUT);
  digitalWrite(pin, LOW);
  delay( 18 );
  digitalWrite(pin, HIGH);
  delayMicroseconds(40);
  pinMode(pin, INPUT);

  for (i = 0; i < MAXTIMINGS; i++) {
    counter = 0;
    while (digitalRead(pin) == laststate) {
      counter++;
      delayMicroseconds(1);
      if (counter == 255)
        break;
    }
    laststate = digitalRead(pin);

    if (counter == 255)
      break;

    if ((i >= 4) && (i % 2 == 0)) {
      dht11_dat[j / 8] <<= 1;
      if (counter > 16)
        dht11_dat[j / 8] |= 1;
      j++;
    }
  }

  if ((j >= 40) &&
      (dht11_dat[4] == ((dht11_dat[0] + dht11_dat[1] + dht11_dat[2] + dht11_dat[3]) & 0xFF))) {
    printf("Humidity = %d.%d %% Temperature = %d.%d C\n",
           dht11_dat[0], dht11_dat[1], dht11_dat[2], dht11_dat[3]);
  } else {
    printf("Bad sample, skip and try again\n");
  }
}

int main(int argc, char** argv) {
  if (wiringPiSetupGpio() == -1)
    exit(1);

  int pin = atoi(argv[1]);
  while (1) {
    sample(pin);
    delay(1000);
  }
}

