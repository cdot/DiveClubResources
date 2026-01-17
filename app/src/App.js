/*@preserve Copyright (C) 2018-2025 Crawford Currie http://c-dot.co.uk license MIT*/
/* eslint-env browser,jquery */

/**
 * Shed management application. See README.md
 */
/* global URL */

import { Config } from "./Config.js";
import { Entries } from "./Entries.js";
import { Roles } from "./Roles.js";

import "jquery";
import "jquery-ui";
import "jquery-validate";
import "jquery-confirm";
import Cookies from "js-cookie";

import "./jq/with-info.js";

/**
 * Update time displays
 */
function tick() {
  const now = new Date();
  $(".time_display").text(now.toLocaleDateString() +
                          " " + now.toLocaleTimeString());
  $(".date_display").text(now.toLocaleDateString());
  const when = 1000 - (Date.now() % 1000);
  window.setTimeout(tick, when);
}

class App {

  /**
   * Set to the original console.debug if debugging is being captured
   * @member {function}
   */
  superDebug = undefined;

  /**
   * @param {object} params parsed from the URL in main.js
   * @param {boolean?} params.debug - 
   */
  constructor(params) {

    this.enableDebug(params.debug);

    /**
     * Default configuration.
     * @member {Config}
     */
    this.config = new Config(
      undefined,
      {
        loan_return: 10,

        features: {
          fixed: true,
          portable: true,
          loans: true,
          inventory: true,
          nitrox: true
        },

        o2: {
					price: 0.01,
					bank: { // random numbers
						1: { size: 50.2, price: 0.02, bar: 96 },
						2: { size: 47.5, price: 0.025, bar: 190 },
						3: { size: 15, price: 0.03, bar: 210 },
						4: { size: 11, price: 0.05, bar: 230 }
					}
				},

        compressor: {
          portable: {
            filter: {
              lifetime: 15,
              a: 1.84879,
              b: 1.124939,
              c: 14.60044,
              d: -0.3252651
            }
          },
          fixed: {
            filter: {
              lifetime: 40,
              a: 3.798205,
              b: 1.149582,
              c: 11.50844,
              d: -0.4806983
            },
            pumping_rate: 300,
            purge_freq: 5,
            safe_limit: 25,
            enable_intake_temperature: true,
            enable_intake_humidity: true,
            enable_internal_temperature: true,
            enable_power: true,
            poll_frequency: 5000,
            internal_temperature_alarm: 90
          }
        }
      });

    new Roles()
    .init(this.config)
    .then(roles => this.roles = roles);
  }

  /**
   * Override console.debug to always add messages to the app #console,
   * as well as to the developer console. Needed when debugging on a browser
   * that doesn't have a debugger (such as Android Webview). Note that the
   * app is only run in debug mode when ?debug is added to the URL. To run it
   * in debug mode all the time would bloat the body too much.
   * @param {boolean} debug true to capture debugging in #console
   * @private
   */
  enableDebug(debug) {
    $("#open_console").hide();
    if (debug) {
      if (!this.superDebug) {
        // Switch on debugging capture
        this.superDebug = console.debug;
        console.debug = (...args) => {
          this.superDebug.call(this, ...args);
          const mess = args.join(" ");
          const $div = $("<div></div>");
          $div.text(mess);
          $("#console").append($div);
        };
        $("#open_console").show();
      }
    } else if (this.superDebug) {
      // Switch off debugging capture
      console.debug = this.superDebug;
      this.superDebug = undefined;
    }
}

  /**
   * Update all UIs from the files in the store
   * @return {Promise} promise that resolves to this
   */
  reload_UI() {
    console.debug("App.reload_UI:");
    return Promise.all(
      Object.values(this)
			.filter(f => f instanceof Entries)
			.map(f => f.promise_to_reload_UI()))
    .then(() => {
      $("#main_tabs").tabs("option", "disabled", []);
      return this;
    });
  }

  /**
   * Invoked to reset the store being used
   */
  change_database() {
    Cookies.remove("database_url");
    location.reload();
  }

  /**
   * Update the local database from the remote read-only database.
   * @param {function} report progress reporting function(css_class, string)
   */
  update_from_remote(report) {
    if (!this.config.get("db_index_url")) {
      $.alert({
        title: "Cannot update from web",
        content: "No DB index URL set"
      });
      return Promise.reject(new Error("Cannot update form web"));
    }
    console.debug("update_from_remote:");
    return new Entries()
    .init({
      id: "RO index",
      store: this.config.store,
      url: new URL(this.config.get("db_index_url")),
      keys: {
        sheet: "string",
        url: "string"
      }
    })
    .then(index => index.loadFromStore())
    .then(index => Promise.all([
      index.find("sheet", "roles")
      .then(row => this.roles.update_from_remote(row.url, report)),
      index.find("sheet", "inventory")
      .then(row => (
        this.inventory
        ? this.inventory.update_from_remote(row.url, report)
        : null))
    ]))
    .then(() => {
      report("info", "Update from the web finished");
      $(document).trigger("reload_ui");
    })
    .catch(e => {
      $.alert({
        title: "Web update failed",
        content: e
      });
    });
  }

  /**
   * Initialise UI components and attach handlers
   * @return Promise
   */
  initialise_ui() {

    // If tabs aren't working, check there's no base tag in <meta>
    $("#main_tabs").tabs();
    console.debug("initialise_ui: tabs built");

    // Generics
    $(".spinner").spinner();
    $("button").button();
    $("input[type='checkbox']").checkboxradio();
    $('.ui-spinner-button').click(function () {
      $(this).siblings('input').change();
    });

    $.validator.setDefaults({ ignore: ".novalidate" });

    $(".validated_form").each(function () {
      $(this).validate({
        // Don't ignore selects that are hidden by jQuery plugins
        ignore: ""
      });
    });

    // Add a validator that looks at the temperature and humidity
    // to determine if the values are within range for operating
    // this compressor
    $.validator.addMethod(
      "compressor",
      (v, el, compressor) => {
        return this[compressor].operable();
      },
      "Compressor must not be operated");

    $("input").on("keypress", function (e) {
      if (e.charCode == 13 && /Android/.test(navigator.userAgent)) {
        e.preventDefault();
        $(this).blur();
      }
    });

    // Start the clock
    tick();

    $("#settings")
    .on("click", () => this.config.open(this));

    // Information buttons
    $("[data-with-info]").with_info();
    
    $(".slider").each(function() {
      const $this = $(this);
      const data = $this.data("slider");
      data.animate = true;
			// The "friend" of a slider is the id of an input that will
			// take the value from the slider
      if (data.friend) {
        data.slide = (e, ui) => {
					// As the slider slides, set the value of the friend
          $(data.friend).val(ui.value);
        };
      }
      $(this).slider(data);
      if (data.friend) {
				// Initialise the slider value to the friend value
        $this.slider("value", $(data.friend).val());
      }
    });

    $(document).on("reload_ui", () => {
      this.reload_UI()
      .then(() => {
        $("#loading").hide();
        $("#console").prependTo($("#console_dialog"));

        const $condlg = $("#console_dialog");

        $("#open_console") // Bug button
        .on("click", () => $condlg.show());

        $condlg.find("[name=close]")
        .on("click", () => {
          $condlg.hide();
        });

        $("#loaded").show();
        window.scrollTo(0, document.body.scrollHeight);
      });
    });
  }

  /**
   * Load config.json from the database url, or write a draft
   * @private
   */
  setup_database() {
    console.debug("setup_database:");
    return Promise.all(Object
								       .values(this)
								       .filter(f => f instanceof Entries)
								       .map(f => {
                         f.store = this.config.store;
                         return f.reset();
                       }));
  }

  /**
   * If the database_connect fails, the database_url cookie may not
   * be set up or may be incorrect. Prompt for a better url.
   * @param {URL} url URL we failed to connect to
   * @param {boolean} use_webdav true to use webdav
   * @return {Promise} resolves to an AbstractStore
   * @private
   */
  database_reconnect(url, use_webdav) {
		const app = this;
    const sensor_server_url = new URL("data", window.location);
    return new Promise(resolve => {
      $.confirm({
        title: $("#connect_failed_dialog").prop("title"),
        content: $("#connect_failed_dialog").html(),
        onContentReady: function () {
          const $dlg_body = this.$content;
          $dlg_body.find("[name=failed_url]").text(url);
          $dlg_body.find("#server_url").text(url);
          if (use_webdav) {
            $dlg_body.find("#use_webdav").prop("checked", true);
            $dlg_body.find("#server_url_required").show();
          } else if (url === sensor_server_url) {
            $dlg_body.find("#use_sensor_server").prop("checked", true);
            $dlg_body.find("#server_url_required").hide();
          } else if (url && url.length > 0) {
            $dlg_body.find("#use_other").prop("checked", true);
            $dlg_body.find("#server_url_required").show();          
          } else {
            $dlg_body.find("#use_browser").prop("checked", true);
            $dlg_body.find("#server_url_required").hide();
          }
          $dlg_body.find('input[type=radio]')
          .on('change', function () {
            switch (this.id) {
            case "use_webdav":
            case "use_other":
              $dlg_body.find("#server_url_required").show();
              break;
            case "use_sensor_server":
            case "use_browser":
              $dlg_body.find("#server_url_required").hide();
              break;
            };
          });
        },
        buttons: {
          "Continue": function () {
            const $dlg_body = this.$content;
            let nurl, ndav = false;
            switch ($dlg_body.find('input[type=radio]:checked')[0].id) {
            case "use_webdav":
              ndav = true;
            case "use_other":
              nurl = new URL($dlg_body.find("[name=server_url]").val());
              break;
            case "use_sensor_server":
              nurl = sensor_server_url;
              break;
            case "use_browser":
              nurl = new URL("browser:");
            }
            console.debug(`database_reconnect: using ${ndav?"WebDAV":""} server ${nurl}`);
            resolve(app.database_connect(nurl, ndav));
          }
        }
      });
    });
  }

  /**
   * If the database server requires authentication, then authenticate.
   * @param {URL} url URL we are connecting to
   * @return {Promise} promise that resolves when authentication is compete
   * @private
   */
  authenticate(url) {
    const app = this;
    return new Promise(resolve => {
      $.confirm({
        title: $("#auth_required").prop("title"),
        content: $("#auth_required").html(),
        onContentReady: function () {
          this.$content.find(".url").text(url);
          this.$content
					.find("input[name='pass']")
					.on("change", () => {
						this.$$login.trigger("click");
					});
        },
        buttons: {
          login: function () {
            const user = this.$content
								  .find("input[name='user']").val();
            const pass = this.$content
								  .find("input[name='pass']").val();
            app.config.store.setCredentials(user, pass);
            resolve(app.database_connect(url));
          }
        }
      });
    });
  }

  /**
   * Enable main tabs
   * @private
   */
  enable_tabs() {
    const cfg = this.config;
    const active = [];
    $("#main_tabs a.main_tab").each(function(index) {
      const name = this.href.replace(/^.*#/, "");
      const tab_enabled = cfg.get(`features:${name}`);
      active[index] = tab_enabled;
      const li = $(`#main_tabs a[href='#${name}']`).closest("li");
      if (tab_enabled)
        li.show();
      else
        li.hide();
    });

    const current = $("#main_tabs").tabs( "option", "active" );
    if (!active[current]) {
      for (let i = 0; i < active.length; i++)
        if (active[i]) {
          $("#main_tabs").tabs( "option", "active", i);
          break;
        }
    }
  }

  /**
   * Construct a store appropriate for the url
   * @param {URL} url the URL where the store is
   * @param {boolean} use_webdav true to use webdav
   * @return {Promise} promise that resolves to an AbstractStore
   */
  construct_store(url, use_webdav) {
    const store_mod = url == "browser:" ? "LocalStorageStore" :
          (use_webdav ? "WebDAVStore" : "GetPostStore");
    return import(`./${store_mod}.js`)
    .then(mods => new mods[store_mod]())
    .catch(e => {
      console.debug(`Could not construct a ${store_mod}`, e);
      return Promise.reject(`Could not construct a ${store_mod}`);
    });
  }

  /**
   * Try a first time connection to the database.
   * @param {URL} url the database URL
   * @param {boolean} use_webdav true to use webdav
   * @return {Promise} resolves to an AbstractStore
   * @private
   */
  database_connect(url, use_webdav) {
    console.debug("database_connect: trying ", url);
    return this.construct_store(url)
    .then(store => store.connect({url: url}))
    .catch(e => {
      console.debug(`database_connect: ${url} connect failed`, e.toString());
      if (e.status === 401) {
        // XMLHttpRequest will only prompt for credentials if
        // the request is for the same origin with no explicit
        // credentials. In any other configuration, it won't prompt
        // So we have to handle credentials if we get a 401.
        console.debug("database_connect: auth failure, prompting");
        return this.authenticate(url);
      }
      // Trying to repeatedly connect doesn't provide any
      // useful feedback. Rejecting at least gives a chance
      // to feeback.
      if (e.html)
        $("#loading").html(e.html);
      return Promise.reject(new Error(`Could not connect to ${url}`));
    })
    .then(store => {
      this.config.store = store;
      console.debug(`database_connect: connected to ${store.constructor.name} at ${url}, loading config.json`);
      return this.config.load()
      .catch(e => {
        console.debug("database_connect: config.json load failed:", e);

        if (url == "browser:") {
          // Loading config.json from localStorage will fail unless
          // the configuration has been changed and saved. Accept it
          // and use defaults.
          return Promise.resolve(this.config.store);
        }

        return new Promise(resolve => {
          $.confirm({
            title: "Failed to load config.json from database",
            content: "You can retry with a different URL or continue with defaults",
            buttons: {
              retry: {
                tect: "Retry",
                action: () => this.database_reconnect(url, use_webdav)
              },
              defaults: {
                text: "Use defaults",
                action: () => resolve(this.config.store)
              }
            }
          });
        });
      })
      .then(() => {
        if (url != "browser:")
          Cookies.set("database_url", url, {
            expires: 365
          });
        this.enable_tabs();
      });
    });
  }

  /**
   * Connect to the database. The database URL is cached in a cookie.
   * @private
   */
  connect_to_database() {
    let promise;
    const cookie = Cookies.get("database_url");
    let url, use_webdav = false;
    if (cookie) {
      console.debug(`connect_to_database: Cookie ${cookie}`);
      const bits = cookie.split("|", 2);
      url = new URL(bits[0]), use_webdav = bits[1];
    } else
      console.debug(`connect_to_database: no Cookie`);

    if (!url || url.length === 0)
      promise = this.database_reconnect(undefined, use_webdav);
    else
      promise = this.database_connect(url, use_webdav);

    return promise
    .then(() => console.debug(`connect_to_database: ${url} connected`))
    .catch(e => {
      console.debug(`App.connect_to_database failed:`, e);
    });
  }

  begin() {
		const requires = [];
		$("#main_tabs li>a").each((i, el) => {
			const id = el.href.replace(/^.*#/, "");
			const clazz = $(el).data("class");
			requires.push(
        import(`./${clazz}.js?TAB`) // the ?TAB is just an aide memoire
        .then(mods => {
          const Tab = mods[clazz];
          return new Tab()
          .init({
						config: this.config,
						app: this,
						id: id,
						store: this.config.store
					});
        })
        .then(tab => tab.loadUI())
        .then(tab => tab.attach_handlers())
        .then(tab => this[id] = tab));
		});
		return Promise.all(requires)
    .then(() => this.initialise_ui())
    .then(() => this.connect_to_database())
    .then(() => this.setup_database())
		.then(() => $(document).trigger("reload_ui"))
    .catch(e => {
      console.debug(`App.begin failed:`, e);
    });
  }
}

export { App }
