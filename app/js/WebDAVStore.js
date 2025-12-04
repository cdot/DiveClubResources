/*@preserve Copyright (C) 2018-2024 Crawford Currie http://c-dot.co.uk license MIT*/
/* eslint-env browser,jquery */

import { AbstractStore } from "./AbstractStore.js";
import { DAVClient } from "./DAVClient.js";

/**
 * Store on a remote webdav server
 */
class WebDAVStore extends AbstractStore {

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
    if (url && url.lastIndexOf('/') !== url.length - 1)
      url += '/';

    const getUrl = window.location;
    const baseUrl = getUrl.protocol + "//" + getUrl.host + "/"
        + getUrl.pathname.split('/')[1];
    console.debug("WebDAVStore URL base", baseUrl);
    if (typeof URL !== "undefined") {
      try {
        url = new URL(url, baseUrl);
      } catch (e) {
        console.debug("WebDAVStore.connect to " + url + " failed: " + e);
        return Promise.reject(new Error(
          "Invalid URL, cannot start WebDAVStore"));
      }
    }

    console.debug("WebDAVStore: connecting to " + url);
    var opts = {
      baseUrl: url
    };
    if (this.user) {
      opts.userName = this.user;
      opts.password = this.pass;
    }
    this.DAV = new DAVClient(opts);
    return this.read("/");
  }

  // @override
  disconnect() {
    this.DAV = null;
    return Promise.resolve();
  }

  // @override
  read(path) {
    const self = this;
		path = path.replace(/^\/+/, "");
    console.debug("\tWebDAVStore: Reading", path);
    if (!this.DAV)
      return Promise.reject(new Error("WebDAVStore not connected"));
    return this.DAV
    .request('GET', path, {
      "Cache-Control": "no-cache"
    })
    .then(res => {
      if (200 <= res.status && res.status < 300)
        return Promise.resolve(res.body);
      return Promise.reject(self._error(res));
    });
  }

  /**
   * Return a Promise to make the folder given by a path array.
   */
  _mkpath(path) {
    "use strict";

    if (path.length === 0)
      return Promise.resolve(); // at the root, always exists

    const self = this;

    return this.DAV
    .request('PROPFIND', path.join('/'), {
      Depth: 1
    })
    .then(
      res => {
        if (200 <= res.status && res.status < 300) {
          return Promise.resolve();
        } else if (res.status === 404) {
          var p = path.slice();
          p.pop();
          return self._mkpath(p).then(() => {
            return self.DAV.request('MKCOL', path.join('/'));
          });
        }
        return Promise.reject(self._error(res));
      });
  }

  // @override
  write(path, data) {
    "use strict";

    const self = this;

    console.debug("WebDAVStore: Writing " + path);

    path = path.replace(/^\/+/, "").split('/');
    var folder = path.slice();
    folder.pop();

    if (!this.DAV)
      return Promise.reject(self._error(new Error("WebDAVStore not connected")));

    return self._mkpath(folder)
    .then(() => {
      return self.DAV.request('PUT', path.join('/'), {}, data)
      .then(res => {
        if (200 <= res.status && res.status < 300)
          return Promise.resolve(res.body);
        return Promise.reject(self._error(res));
      });
    });
  }
}

export { WebDAVStore }
