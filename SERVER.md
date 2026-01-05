# Server

This is an ultra-light web server using [Express](https://expressjs.com),
designed to be run on a Raspberry Pi (RPi). It was developed using `node.js 18.19.0` running `dietpi 4.19.66`. It should work with Raspberry Pi OS (Raspbian)
and on other RPi architectures as well, though it is untested.

The server supports file access for serving HTML and other resources, and
AJAX requests for access to DHT11, DS18B20, and PC817 sensors, all attached
to GPIO. It also optionally supports unautheticated POST requests for saving
CSV data files to a directory.

The pinout for the sensors is shown in [RPi pinout.svg](RPi pinout.svg)

# Configuration
The server is configured from a file specified using the -c option on the
command-line. An example is given [here](server/example.cfg). The configuration
file is in JSON format and supports the following:
* `data_dir` server path to a directory that CSV files can be POSTed to. Set undefined if you don't want this enabled.
* `port` the port to listen on
* `sensors` an array of sensor configurations. Each configuration specifies:
  * `name` the name of the sensor
  * `class` the Javascript class that supports this sensor type
  * other fields that are required to configure the sensor, described below.

# Sensor Configuration

## DHT11

This sensor is used to measure the temperature and humidity of the
intake air drawn into the compressor. It can be powered from the RPi and uses a single GPIO pin, plus power. Accessing this sensor is handled by the `node-dht-sensor` npm package.

The sensor has a humidity range between 20% and 90%. If the reading is outside that range, the reading is marked as "dubious" as the sensor requires recalibration. Note that the DHT family humidity sensor is notoriously inaccurate, and the recalibration process is tedious, so it can easily be disabled when it falls out of calibration.

### Configuration
The supporting class is `DHTxx`. The fields required for configuration are:
* `type` the sensor type eg 11 for a DHT11
* `gpio` the GPIO pin the sensor signal wire connected to
* `field` the field the sensor is reading, either `temperature` or `humidity`

## DS18b20

This sensor is used to measure the temperature of the 3rd stage head
in the compressor. The standard one-wire support built in to the RPi
can be configured to read a GPIO pin by adding to `/boot/config.txt`,
thus (sensor attached to GPIO pin 18):
```
# 1-wire settings
dtoverlay=w1-gpio,gpiopin=18
```
After a reboot you can see what sensors are connected using 
```
ls /sys/bus/w1/devices/w1_bus_master1
```
Expect to see devices such as `28-0316027f81ff`.

### Configuration
The supporting class is `DS18x20`. Only one field is required for configuration:
* `sensor_id`: the one-wire id for the sensor.

## PC817
The PC817 is an opto-isolated power sensor that simply drives a GPIO pin high when power is active.

### Configuration
The supporting class is `Timer`. The fields required for configuration are:
* `gpio` the GPIO pin the sensor signal wire connected to
* `poll` the polling frequency in ms

# Starting the Server
You will need to install node.js and npm.

Install the server software from github.
```
$ cd ~
$ git clone https://github.com/cdot/DiveClubResources.git
$ cd DiveClubResources/server
$ npm install
```
The server is then run as follows:
```
$ node src/server.js -c <configuration file>
```

The server has a number of command-line options that can be explored
using the `--help` option.

## Running the Server on Boot

You probably want the the server to be started automatically on boot.

### dietpi
On dietpi you can use `dietpi-autostart` and create a `/var/lib/dietpi/dietpi-autostart/custom.sh` script as follows:

```
#!/bin/bash
#---Put your code below this line---
/usr/local/node18/bin/node /home/dietpi/DiveClubResources/server/src/server.js -
c /home/dietpi/DiveClubResources/server.cfg
```

### Raspberry Pi OS
On Rasbian the server can be started using an init.d script,
for example `/etc/init.d/diveclub.sh`. You will need to create this
script.

Assuming the code is checked out to `/home/pi/DiveClubResources` and there
is a server configuration file at /home/pi/DiveClubResources/server.cfg:

```
$ sudo nano /etc/init.d/diveclub.sh
#!/bin/sh
# diveclub.sh
### BEGIN INIT INFO
# Provides:          DiveClubResources server
# Required-Start:    $local_fs
# Required-Stop:
# Default-Start:     1 2 3 4 5 6
# Default-Stop:      
# Short-Description: Start the DiveClubResources server
# Description:       DiveClubResources server
### END INIT INFO

#
SCRIPT=/home/pi/DiveClubResources/server/src/server.js
CONFIG=/home/pi/DiveClubResources/server.cfg

case "$1" in
  start)
    node "$SCRIPT" -c "$CONFIG" > /var/log/sensors.log 2>&1 &
    ;;
  stop)
    pid=`ps -Af | grep "$SCRIPT" | grep -v grep | sed -e 's/^[^0-9]*//;s/\s.*//'
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
```

Then from the command line:
```
$ sudo chmod +x /etc/init.d/diveclub.sh
$ sudo update-rc.d sensors.sh defaults
```

The service should start automatically on the next boot. To start
the service from the command line:
```
$ sudo service diveclub.sh start
```
Sensors must be physically attached and available when the server is
started, or they will not be detected. The server can be
restarted at any time using
```
$ sudo service diveclub.sh restart
```
When the service is running you can use HTTP requests to query the sensors e.g.
if your server is running on 192.168.1.24, port 8000:
```
$ curl http://192.168.1.24:8000/internal_temperature
```
The [browser app](BROWSER.md) uses these queries to update the UI.

# Development

The server is written entirely in Javascript, using [node.js](https://nodejs.org/en/).

The `scripts` field of `package.json` is used to run development tasks.
Available targets are:
```
$ npm run lint # run eslint on source code
$ npm run test # use nocha to run all unit tests
```
To simplify app development, the server can be run even when no
hardware sensors are available by passing the `--simulate` option on the
command line. This will attach a simple simulation in place of any sensors
that can't be found.
