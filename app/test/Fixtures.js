/*@preserve Copyright (C) 20 Crawford Currie http://c-dot.co.uk license MIT*/
/* global jQuery */
/* global $ */
/* global DOM */
import { assert } from "chai";

// Placeholder to disable tests while debugging.
function UNit() {};

/**
 * Set up jQuery and jQuery-UI
 * * global.DOM
 * * global.window
 * * global.document
 * * global.jQuery
 * * global.$
 * call in before(). jQuery will be re-used between combined tests
 * (e.g.  npm run test or mocha *.js).
 * @param {string} url the url we are pretending to have been loaded from.
 * Not supported in the browser.
 * @param {string} html path to an html file to load.
 * Not supported in the browser.
 * @return {Promise}
 */
function setup$(url, html) {
  if (typeof global === "undefined") {
    // Browser
    return import("jquery")
    .then(() => import("jquery-ui"));
  }

  const p = import.meta.url.replace(/^file:\/\//, "").replace(/\/[^/]*$/, "");
  if (html) html = `${p}/${html}`;
  if (url) url = `${import.meta.url}/${url}`;

  if (global.$) {
    // jQuery is already defined, can't reset the DOM because
    // import() won't re-run side-effecting dependencies such as
    // jquery so have to re-use the existing document. WARNING:
    // subtle bugs may lie ahead! :-(
    //console.debug("$RECONFIGURE", url);
    DOM.reconfigure({ url: url });
    if (html) {
      $("head").html("");
      return Promise.all([
        import("path"),
        import("fs")
      ])
      .then(mods => {
        const path = mods[0], Fs = mods[1].promises;
        return Fs.readFile(path.resolve(html));
      })
      .then(buf => {
        // Only the body, ignore the head
        const html = buf.toString().replace(/.*<body[^>]*>(.*)<\/body>.*/, "$1");
        //console.debug("$HTML", html.length);
        $("body").html(html);
      });
    } else {
      $("head").html("");
      $("body").html("");
      return Promise.resolve();
    }
  }

  return Promise.all([
    import("jsdom"),
    import("jquery")
  ])
  .then(mods => {
    const jsdom = mods[0];
    const JSDOM = jsdom.JSDOM;
    const jquery = mods[1].default;

    // Monitor resource loading - debug - lets us track
    // CSS etc loading
    class CustomResourceLoader extends jsdom.ResourceLoader {
      fetch(url, options) {
        url = url.replace("/test/", "/");
        console.debug("FETCHING", url);
        return super.fetch(url, options)
        .then(buff => {
          console.debug("LOADED", url);
          return buff;
        });
      }
    }
    const opts = {
      resources: new CustomResourceLoader(), // debug
      url: url
    };
    const prom = html
          ? JSDOM.fromFile(html, opts)
          : Promise.resolve(new JSDOM(`<!doctype html><html></html>"`, opts));
    return prom.then(dom => {
      global.DOM = dom;
      global.window = DOM.window;
      global.document = DOM.window.document;
      global.$ = global.jQuery = jquery(window);
      assert($.ajax);
      assert.equal(jQuery.ajax, $.ajax);
    });
  })

  .then(() => import("jquery-ui/dist/jquery-ui.js"));
}

export { setup$, UNit }
