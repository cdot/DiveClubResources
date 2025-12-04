/*@preserve Copyright (C) 2018-2025 Crawford Currie http://c-dot.co.uk license MIT*/
/* eslint-env browser,jquery */

/**
 * Shed management application. See README.md
 */

import { Config } from "./Config.js";
import { GetPostStore } from "./GetPostStore.js";
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

window.SERVER_URL = String(window.location).replace(/\?.*/, "");

class Sheds {

  /**
   * @param {object} params parsed from the URL in main.js
   * @param {boolean?} params.console - redirect debugging output to a console.
   * Useful when debugging on a browser that doesn't have a debugger
   * (such as Android Webview)
   */
  constructor(params) {
    /**
     * The app console (a div) is initially open, but is closed
     * after loading unless this is true.
     * @member {boolean}
     * @private
     */
    this.keepConsoleOpen = params.console;

    /**
     * Configuration. The default uses a GetPostStore.
     * @member {Config}
     */
    this.config = new Config(
      new GetPostStore(),
      {
        loan_return: 10,
        o2: {
					price: 0.01,
					bank: { // random numbers
						1: { size: 50.2, price: 0.015, bar: 96 },
						2: { size: 47.5, price: 0.02, bar: 190 },
						3: { size: 15, price: 0.025, bar: 210 },
						4: { size: 11, price: 0.03, bar: 230 }
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
   * Update all UIs from the files in the store
   * @return {Promise} promise that resolves to this
   * @override
   */
  reloadUI() {
    console.debug("Reloading UI");
    return Promise.all(
      Object.values(this)
			.filter(f => f instanceof Entries)
			.map(f => f.reloadUI()))
    .then(() => {
      $("#main_tabs").tabs("option", "disabled", []);
      return this;
    });
  }

  update_from_web(report) {
    if (!this.config.get("db_index_url")) {
      $.alert({
        title: "Cannot update from web",
        content: "No DB index URL set"
      });
      return Promise.reject(new Error("Cannot update form web"));
    }
    console.debug("Updating from read-only database");
    return new Entries()
    .init({
      url: this.config.get("db_index_url"),
      keys: {
        sheet: "string",
        url: "string"
      }
    })
    .then(index => index.loadFromStore())
    .then(index => Promise.all([
      index.find("sheet", "roles")
      .then(row => this.roles.update_from_web(row.url, report)),
      index.find("sheet", "inventory")
      .then(row => (
        this.inventory
        ? this.inventory.update_from_web(row.url, report)
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
   * @return Promise
   */
  initialise_ui() {
    // If tabs aren't working, check there's no base tag in <meta>
    $("#main_tabs").tabs();
    console.debug("Tabs built");

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
      this.reloadUI()
      .then(() => {
        $("#loading").hide();
        $("#console").prependTo($("#console_dialog"));

        const $condlg = $("#console_dialog");
        $("#open_console")
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
   * @param {string} url the url to load from
   * @param {boolean} no_draft true if we shouldn't try to save a draft
   */
  setup_database(url, no_draft) {
    console.debug(`setup_database: setting up store at ${url}`);
    return this.config.store
    .connect(url)
    .then(() => {
      console.debug(`setup_database: Connected to ${url}, loading config`);
      return this.config.load()
      .catch(e => {
        console.debug("Config.load: failed:", e);
        // Carry on with defaults
        alert("Failed to load database configuration, probably because config.json couldn't be found. You should check the configuration and save it. Continuing with defaults.");
      })
      .always(() => 
				// Reset all Entries
				Promise.all(Object
								    .values(this)
								    .filter(f => f instanceof Entries)
								    .map(f => f.reset()))
				.then(() => $(document).trigger("reload_ui")));
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
						sheds: this,
						id: id,
						store: this.config.store
					});
        })
        .then(tab => tab.loadUI())
        .then(tab => tab.attachHandlers())
        .then(tab => this[id] = tab));
		});
		return Promise.all(requires)
    .then(() => this.initialise_ui())
    .then(() => this.setup_database(`${window.SERVER_URL}data`))
    .catch(e => {
      console.error(`Failed to setup store`, e);
    });
  }
}

export { Sheds }
