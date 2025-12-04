/*@preserve Copyright (C) 2019-2022 Crawford Currie http://c-dot.co.uk license MIT*/
/* eslint-env node.js */

/**
 * Common base class for sensors
 */
class Sensor {

  /**
   * @param {string} config.name sensor name
   * @param {Simulator} config.simulation simulator
   */
  constructor(config) {
    this.name = config.name;
    this.simulation = config.simulation;
  }

  /**
   * Check that the sensor is ready. Default does nothing
   * @return {Promise} a promise to check that the sensor is available
   */
  connect() {
    return Promise.resolve(false);
  }

  /**
   * Sample the sensor
   * @return {Promise} to sample the sensor and return a simple value
   */
  sample() {
    return Promise.resolve(null);
  }

	/**
	 * Set this sensor to use simulation
	 */
	simulate() {
		throw new Error("Missing simulation");
	}
}

export { Sensor }
