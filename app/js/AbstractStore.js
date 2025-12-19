/*@preserve Copyright (C) 2015-2024 Crawford Currie http://c-dot.co.uk license MIT*/

/**
 * Pure virtual base class of store providers.
 *
 * Store providers provide a simple file system interface to text data in the
 * store.
 */

class AbstractStore {

  /**
   * Promise to connect to this store using the given parameters.
   * Pure virtual.
   * @param {object} params
   * @return {Promise} promise that resolves to this
   */
  connect(params) {
    return Promise.reject(new Error(`Store has no connect method ${params}`));
  }

  /**
   * Set credentials for this store
   * @param {string} user username
   * @param {string} pass password
   */
  setCredentials(user, pass) {
    throw new Error(`Store has no setCredentials method ${user} ${pass}`);
  }

  /**
   * Promise to disconnect from this store. Virtual.
   * This method should clear all caches and log out from the store,
   * if appropriate.
   */
  disconnect() {
    return Promise.resolve();
  }

  /**
   * Return a Promise to write data. Pure virtual. Note that the store is
   * expected to create intermediate directory levels on the fly.
   * @param {string} path pathname to store the data under, a / separated path string
   * @param {string} data a string to store
   */
  write(path, data) {
    return Promise.reject(new Error(`Store has no write method ${path} ${data}`));
  }

  /**
   * Return a Promise to read data.
   * @param path pathname the data is stored under, a / separated path string
   * @return {Promise} promise that resolves to the data read.
   */
  read(path) {
    return Promise.reject(new Error("Store has no read method", path));
  }
}

export { AbstractStore }

