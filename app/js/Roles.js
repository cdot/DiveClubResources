/*@preserve Copyright (C) 2018-2024 Crawford Currie http://c-dot.co.uk license MIT*/
/* eslint-env jquery */

import "jquery";

import { Entries } from "./Entries.js";

/**
 * Record of roles performed by different members. It is primarily
 * used to populate selects in the UI.
 */ 
class Roles extends Entries {

  init(params) {
    return super.init($.extend(params, {
      file: "roles.csv",
      keys: {
        role: "string",
        list: "string"
      }
    }));
  }

  /**
   * Reload the UI by re-reading the roles file from the cache
   * @return {Promise} promise that resolves to this
   */
  reloadUI() {
    console.debug("Reloading roles");
    return this.loadFromStore()
    .then(roles => {
      // Roles.csv has two columns, "role" and "list" which is a
      // comma-separated list of members in that role
      roles.each(row => {
        if (!row.role || !row.list)
          throw new Error("Roles.csv has broken header row");
        const $lists = $(`select.${row.role}`);
        $lists.html("<option></option>");
        const list = row.list.split(",");
        $.each(list, function (i, m) {
          $lists.append("<option>" + m + "</option>");
        });
      });
      return this;
    })
    .catch(e => {
      console.error("Roles load failed: " + e);
      return this;
    });
  }

  /**
   * Update roles in the cache by reading from a CSV file on the web
   */
  update_from_web(roles_url, report) {
    return $.ajax({
      url: roles_url,
      data: {
        t: Date.now()
      },
      dataType: "text"
    })
    .then(response => {
      report("info", "Read roles from the web");
			this.reset();
      return this.store.write('roles.csv', response)
      .then(() => {
        report("info", "Updated roles");
      })
      .catch(e => {
        report("error", "Error writing roles to the cache: " +
               (e.status ? e.status : e));
      });
    })
    .catch(e => {
      report("error", "Error reading roles from the web: " +
             (e.status ? e.status : e));
    });
  }
}

export { Roles }
