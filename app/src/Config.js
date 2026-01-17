/*@preserve Copyright (C) 2018-2025 Crawford Currie http://c-dot.co.uk license MIT*/
/* eslint-env browser,jquery */

class Config {
  /**
   * Store for load/save
   * @member {AbstractStore}
   */
  store = undefined;

  /**
   * Configuration items are stored in a file 'config.json' in the store
   */
  constructor(store, defaults) {
    this.store = store;
    const sd = {};
    let key;
    for (key in defaults) {
      if (Object.hasOwn(defaults, key))
        sd[key] = defaults[key];
    }
    this.store_data = sd;
  }

  /**
   * Load the config from the store.
   */
  load() {
    return this.store
    .read("config.json")
    .then(json => {
      const d = JSON.parse(json);
      this.store_data = $.extend({}, this.store_data, d);
      console.debug("Config.load: config.json loaded");
    });
  }

  /**
   * Save the config to the store.
   */
  save() {
    return this.store.write(
      "config.json",
      JSON.stringify(this.store_data, null, 1))
    .then(() => {
      console.debug("Config.save: config.json saved");
    })
    .catch(e => {
      console.debug("Config.save failed:", e);
      $.alert({ title: "Config save failed",
                content: e.message });
    });
  }

  /**
   * Get a config key with given default.
   * @param {string} k key
   * @param {(string|number|boolean)?} deflt default
   */
  get(k, deflt) {
    let data = this.store_data;
    for (const bit of k.split(":")) {
      data = data[bit];
      if (typeof data === "undefined")
        return deflt;
    }
    return data;
  }

  /**
   * Set a config key to the given value.
   * @param {string} k key
   * @param {(string|number|boolean)?} v value
   */
  set(k, v) {
    const bits = k.split(":");
    let data = this.store_data;
    while (bits.length > 1) {
      const k = bits.shift();
      if (typeof data[k] === "undefined")
        data[k] = {};
      data = data[k];
    }
    data[bits[0]] = v;
  }

  /**
   * Populate the dialog for the configuration
   * @param {App} app the application
   * @private
   */
  create(app) {
    const config = this;
    this.$content = $("#settings_dialog");
    this.$content.show();

    $("input[type=number]", this.$content)
    .on("change", evt => {
      let v = $(evt.target).val();
      if (/^[0-9.]*$/.test(v)) {
        const sv = v;
        try {
          v = parseFloat(sv);
        } catch (e) {
          console.debug(e);
          v = sv;
        }
      }
      console.debug(`Set ${evt.target.name} = ${v}`);
      config.set(evt.target.name, v);
      config.save();
    });
      
    $("input[type=text]", this.$content)
    .on("change", evt => 
      config.set(evt.target.name, $(evt.target).val()));
      
    $("input[type=checkbox]", config.$content)
    .on("change", evt => {
      const now = $(evt.target).is(":checked");
      const v = config.get(evt.target.name);
      const cur = /^\s*(true|1|on|yes)\s*/i.test(v);
      if ((cur && !now) || (!cur && now)) {
        config.set(evt.target.name, now);
        config.save();
      }
    });

    $("[data-with-info]", config.$content)
    .with_info();

    $("button[name=change_database]")
    .on("click", () => app.change_database());

    $("button[name=update_from_remote]")
    .on("click", () => {
      const $a = $.confirm({
        title: "Updating from the remote database",
        content: ""
      });
      config.save()
      .then(() => app.update_from_remote((clss, m) => {
        $a.setContentAppend(`<div class="${clss}">${m}</div>`);
      }));
    });

    $(".tab_enabler").each(function() {
      $(this)
      .on("change", function() {
        const tab_enabled = $(this).is("checked");
        config.set(`features:${this.name}`, tab_enabled);
        app.enable_tabs();
      });
    });

    $("button[name=close]", config.$content)
    .on("click", () => {
      config.$content.hide();
      $("#loaded").show();
    });
  }

  /**
   * Open the dialog for the config
   * @param {App} app the application
   */
  open(app) {
    if (!this.$content)
      this.create(app);

    $("input[type=text],input[type=number]", this.$content)
    .each((i, el) => $(el).val(this.get(el.name)));

    $("input[type=checkbox]", this.$content)
    .each((i, el) => {
      const v = this.get(el.name);
      if (/^\s*(true|1|on|yes)\s*/i.test(v))
        $(el).prop("checked", true).change();
      else 
        $(el).removeProp("checked").change();
    });

    $("#loaded").hide();
    this.$content.show();
  }
}

export { Config };
