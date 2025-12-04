/*@preserve Copyright (C) 2019 Crawford Currie http://c-dot.co.uk license MIT*/
/* eslint-env node.js */
import DS18B20_raspi from "ds18b20-raspi";
import { Sensor } from "./Sensor.js";
import { Time } from "./Time.js";
import { RangeSimulator } from "./RangeSimulator.js";

/**
 * Interface to DS18x20 device on one-wire bus connected to
 * GPIO on Raspberry PI
 */
class DS18x20 extends Sensor {

  /**
   * @param {string} config.name sensor name
   * @param {Simulator} config.simulation simulator
   * @param {string} config.sensor_id one-wire sensor ID for DS18x20
   */
  constructor(config) {
    super(config);
    this.mSensorId = config.sensor_id;
  }

  /** @override */
  connect() {
    if (typeof this.mSensorId !== "string")
      return Promise.reject(this.name + " has no sensor_id");

    // Make sure we can read from the config
    return new Promise((resolve, reject) => {
      DS18B20_raspi.readSimpleC((err, temp) => {
        if (err) {
          reject(err);
          return;
        }
        console.debug(`DS18x20 ${this.mSensorId} connected`);
        resolve();
      });
    });
  }

  /**
   * @Override
   */
  sample() {
    return new Promise((resolve, reject) => {
			if (this.simulation)
				resolve({ sample: this.simulation.sample(),
							    time: Time.now() });
			else
				DS18B20_raspi.readSimpleC((err, temp) => {
					if (err) {
            reject(err);
            return;
          }
					resolve({ sample: temp, time: Time.now() });
				});
    });
  }

  /** @override */
	simulate() {
		this.simulation = new RangeSimulator(1, 100);
	}
}

export { DS18x20 }
