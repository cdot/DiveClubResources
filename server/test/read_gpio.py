#!/usr/bin/env python

# Read from BCM pin with pulldown active

import RPi.GPIO as GPIO
import sys

PIN = int(sys.argv[1])

GPIO.setmode(GPIO.BCM)
GPIO.setup(PIN, GPIO.IN, pull_up_down=GPIO.PUD_DOWN)

while True:
    state = GPIO.input(PIN)
    print(state)
