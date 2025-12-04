/*@preserve Copyright (C) 2019-2024 Crawford Currie http://c-dot.co.uk license MIT*/
/* eslint-env browser */

import { Sheds } from "./Sheds.js";

const params = {};
const url_params = window.location.search.substring(1);
if (url_params) {
  for (const setting of url_params.split(/[;&]/)) {
    const set = setting.split("=", 2);
    if (set.length == 1)
      params[setting] = true;
    else
      params[set[0]] = set[1];
  }

  if (params.debug) {
    const superDebug = console.debug;

    /**
     * Debug print function. Messages are always added to the app console,
     * and to the developer console.
     */
    console.debug = (...args) => {
      const mess = args.join(" ");
      superDebug(mess);
      const $div = $("<div></div>");
      $div.text(mess);
      $("#console").append($div);
    };
  }
}

new Sheds(params).begin();
