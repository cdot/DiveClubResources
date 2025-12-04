/*@preserve Copyright (C) 2025 Crawford Currie http://c-dot.co.uk license MIT*/
/* eslint-env browser,jquery */

import { AbstractStore } from "./AbstractStore.js";

/**
 * Store on a server that uses GET and POST to retrieve and save text files.
 * Access controls are not supported.
 */
class GetPostStore extends AbstractStore {

  // @override
  setCredentials(user, pass) {
    this.user = user;
    this.pass = pass;
  }

  _error(res) {
    if (typeof res.body === "string" && res.body.length > 0) {
      res.html = res.body
      .replace(/\n/g, " ") // Firefox doesn't support dotAll
      .replace(/^.*<body>/i, "")
      .replace(/<\/body>.*$/i, "");
    }
    return res;
  }

  // @override
  connect(url) {
    console.debug("GetPostStore: root at " + url);
    this.url = url;
    return Promise.resolve();
  }

  // @override
  disconnect() {
    this.root = undefined;
    return Promise.resolve();
  }

  // @override
  read(path) {
    const url = `${this.url}/${path}`;
    console.debug(`GetPostStore.read(${url})`);
    return $.get(url, null, null, "text");
  }

  // @override
  write(path, data) {
    const url = `${this.url}/${path}`;
    return $.post(url, data, null, "text");
  }
}

export { GetPostStore }
