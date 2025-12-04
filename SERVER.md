# Server

This is an ultra-light web server using [Express](https://expressjs.com),
designed to be run on a Raspberry Pi.

The server supports file access for serving HTML and other resources, and
AJAX requests for access to DHT11, DS18B20, and PC817 sensors, all attached
to GPIO.

The pinout for the sensors is shown in [RPi pinout.svg](RPi pinout.svg)

# Hardware Configuration

## DHT11

This sensor is used to measure the temperature and humidity of the
intake air drawn into the compressor.

Accessing this sensor is handled by the `node-dht-sensor` npm package. We use GPIO 14 for this sensor.

The sensor has a range between 20% and 90%. If the reading is outside that
range, the reading is marked as "dubious" as the sensor requires recalibration.

Note that the DHT family humidity sensor is notoriously inaccurate, so it
can easily be disabled when it falls out of calibration.

## DS18b20 sensor

This sensor is used to measure the temperature of the 3rd stage head
in the compressor. The standard one-wire support built in to the RPi
was configured to read GPIO pin 18 by adding to `/boot/config.txt`,
thus:
```
# 1-wire settings
dtoverlay=w1-gpio,gpiopin=18
```
After a reboot you can see what sensors are connected using 
```
ls /sys/bus/w1/devices/w1_bus_master1
```
Expect to see devices such as `28-0316027f81ff`

## PC817 sensor
The PC817 is an opto-isolated power sensor that simply drives a GPIO pin high when power is active.

# Server Configuration
You will need to install node.js and npm.

Install the server software from github.
```
$ cd ~
$ git clone https://github.com/cdot/HSAC.git
$ cd HSAC/server
$ npm install
```
The server is then run as follows:
```
$ node ~/HSAC/server/server.js -c <configuration file>
```
The configuration file is a list of sensors. Each sensor has
at least:
* class - the name of a class that implements an interface to the sensor
* name - the name of the sensor. This will be used to create an AJAX
entry point.

DHTxx sensors also have:
* type - the type of the DHT sensor, either 11 or 22
* gpio - the GPIO pin for DHT11 data
* field - the field (either temperature or humidity) of the sensor result
  required

DS18x20 sensors have:
* sensor_id - the ID of the DS18B20 sensor on the 1-wire network

Power sensors have:
* gpio - the GPIO pin the sensor will pull up (BCM pin numbering)
* timeout - the time for which the sensor must be quiescent to qualify as "off"

an example configuration file is given in sensors/example.cfg

The server has a number of command-line options that can be explored
using the `--help` option.

## Running the Server on Boot

The server needs to be started on boot, by `/etc/init.d/sensors.sh`
- you will need to create this file. Assuming the code is checked out to
`/home/pi/HSAC`:

```
$ sudo nano /etc/init.d/sensors.sh
#!/bin/sh
# sensors.sh
### BEGIN INIT INFO
# Provides:          sensors
# Required-Start:    $local_fs
# Required-Stop:
# Default-Start:     1 2 3 4 5 6
# Default-Stop:      
# Short-Description: Sensors init script
# Description:       Start the sensors server
### END INIT INFO

#
case "$1" in
  start)
    node /home/pi/HSAC/server/js/server.js -p 8000 -c /home/pi/HSAC/sensors.cfg > /var/log/sensors.log 2>&1 &
    ;;
  stop)
    pid=`ps -Af | grep "sensors/js/sensors.js" | grep -v grep | sed -e 's/^[^0-9]*//;s/\s.*//'
`
    if [ "$pid"!="" ]; then
	( echo "Service stopping $pid"; kill -9 $pid ) 2>&1 \
	  >> /var/log/sensors.log
    fi
    ;;
  restart)
    $0 stop
    $0 start
    ;;
esac
$ sudo chmod 755 /etc/init.d/sensors.sh
$ sudo update-rc.d sensors.sh defaults
```
The service should start on the next boot. To start the service from
the command line:
```
$ sudo service sensors.sh start
```
Sensors must be physically attached and available when the server is
started, or they will not be detected by the service. The server can be
restarted at any time using
```
$ sudo service sensors.sh restart
```
When the service is running you can use HTTP requests to query the sensors e.g.
if your sensors service is running on 192.168.1.24, port 80:
```
$ curl http://192.168.1.24/internal_temperature
```
The [browser app](BROWSER.md) uses these queries to update the UI.

# Development

The server is written entirely in Javascript, using [node.js](https://nodejs.org/en/).

The `scripts` field of `package.json` is used to run development tasks.
Available targets are:
```
$ npm run lint # run eslint on source code
$ npm run update # run ncu-u to update npm dependencies
$ npm run test # use nocha to run all unit tests
```
To simplify app development, the server can be run even when no
hardware sensors are available by passing the `--simulate` option on the
command line. This can be done from the command line using:
```
$ npm run simulation
```

