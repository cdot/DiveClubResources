/*@preserve Copyright (C) 2018-2024 Crawford Currie http://c-dot.co.uk license MIT*/
/* eslint-env browser,jquery */
/* global URL */

import "jquery";
import "./jq/edit-in-place.js";

import { Entries } from "./Entries.js";

// input types for headings
const HEAD_TYPES = {
  date: "datetime-local",
  temperature: "number",
  humidity: "number",
  runtime: "number"
  // Other fields are all "string"
};

// Tradeoff on the number of rows of history to show in the UI. The
// history can grow large, thousands of entries, which would be slow
// to load into the DOM. However we are very unlikely to ever want to
// edit outside the last 30 or so rows and if we do, we can always
// edit the .csv file
const HISTORY_TRS = 50;

// Base URL for sensors
const SENSOR_URL = window.location;

/**
 * @param {number} a time delta in hours
 * @return {string} a formatted string 12:34:56.78
 */
function hms(v) {
  const hours = Math.floor(v);
  v = (v - hours) * 60; // minutes
  const mins = Math.floor(v);
  const secs = ((v - mins) * 60).toFixed(2); // seconds, to 2 decimals
  return `0${hours}`.slice(-2) + ":" + `0${mins}`.slice(-2)
  + ":" + `0${secs}`.slice(-5);
}

/**
 * Compressor runtime events page.
 */
class Compressor extends Entries {

  /**
   * Total runtime in hours for this compressor to date
   * @member {number}
   */
  runtime = 0;

  /**
   * Shortcut to the form in the $tab
   * @member {jQuery}
   */
  $form = undefined;

  /**
   * Shortcut to the input that records the runtime
   * @member {jQuery}
   */
  $runtime = undefined;

  /**
   * Configuration object
   * @member {Config}
   */
  config = undefined;

  /**
   * Sensor sampling timer id
   * @member {number}
   */
  sensor_timeoutID = undefined;

  /**
	 * Standard params same as Entries.
   */
  init(params) {
    return super.init($.extend(params, {
      file: `${params.id}_compressor.csv`,
      keys: {
        date: "Date",
        operator: "string",
        temperature: "number",
        humidity: "number",
        runtime: "number",
        filters_changed: "boolean"
      }
    }));
  }

  /**
   * Add a record from the values in the UI
   * @return {Promise} promise that resolves when the record is added
   */
  addCompressorRecord() {
		if (typeof this.$form.valid === "function" && !this.$form.valid()) {
      console.debug("Form invalid");
			return Promise.reject();
    }
		const $session_pause = this.$tab.find("button.session_pause");
		const $session_time = this.$tab.find(".session_time");

		// Stop the counter
		$session_pause.trigger("click");

		const record = {};
		this.$form.find(":input").each((i, el) => {
			if (el.name in this.keys) {
				record[el.name] = this.deserialise(
					el.name, $(el).val());
      }
		});
		console.debug("Adding compressor record", record);
		return this.add_record(record)
    .then(() => {
			$session_time.trigger("ticktock");
			// Clear down the operator
			this.$form.find("[name='operator']").val('');
			// Make sure the form reflects where we are
			this.set_last_runtime(record);
			// Validate the form for the new record
			this.validate_form();
		});
  }
  
	//@override
  attach_handlers() {
		this.$form = this.$tab.find(".validated_form");
		const $runtime = this.$runtime = this.$tab.find("input[name='runtime']");

		// Controls for manual timer with portable compressor
		const $session_play = this.$tab.find("button.session_play");
		const $session_pause = this.$tab.find("button.session_pause");
		const $session_time = this.$tab.find(".session_time");
		let timer;
		let session_time = 0; // time run in this session, ms
		let session_step_start;

		// Handler for a clock tick event
		$session_time.on("ticktock", () => {
			let seconds = Math.round(session_time / 1000);
			let minutes = Math.floor(seconds / 60);
			seconds -= minutes * 60;
			const hours = Math.floor(minutes / 60);
			minutes -= hours * 60;

			let times = (minutes < 10 ? "0" : "") + minutes +
					":" + (seconds < 10 ? "0" : "") + seconds;
			if (hours > 0)
				times = (hours < 10 ? "0" : "") + hours + ":" + times;
			$session_time.text(times);
			let rta = 0;
			if (this.length() > 0)
				rta = this.get(this.length() - 1).runtime;
			// Convert to hours
			rta += session_time / 3600000;
			this.set_runtime_and_digits(rta);
			this.validate_form();
		});

		function tock() {
			const now = Date.now();
			session_time += now - session_step_start;
			session_step_start = now;
			$session_time.trigger("ticktock");
		}

		function tick() {
			tock();
			const when = 1000 - (Date.now() % 1000);
			timer = setTimeout(tick, when);
		}

		$session_play
    .on("click", () => {
			session_step_start = Date.now();
			tick();
			$session_play.button("disable");
			$session_pause.button("enable");
			$runtime.prop("readonly", "readonly");
		});

		$session_pause
    .on("click", () => {
			if (timer)
				clearTimeout(timer);
			timer = null;
			tock();
			$session_pause.button("disable");
			$session_play.button("enable");
			$runtime.prop("readonly", null);
		});

		// Digits runtime control changed?
		this.$form.find("select.digital")
		.on("change", () => this.read_digits());

		// Handling form submission
		this.$form.find(":input")
		.on("change", () => this.validate_form());
		
		this.$form.on("submit", e => {
			e.preventDefault();
			return false;
		});

		this.$tab.find(".cr_last_run")
		.off("click")
		.on("click", () => {
      const $history = $("#history");
      const $dlg = $("#history_dialog");
      // Has to be moved up to cover everything else
      $("body").append($dlg);
      $("#HISTORY_TRS").text(HISTORY_TRS);
			$history.empty().append(this.$history_table(HISTORY_TRS));

      $dlg
      .show()
      .find("button[name=close]")
      .on("click", () => {
        $dlg.hide();
        $("#loaded").show();
      });

      $dlg
      .show()
      .find("button[name=addrow]")
      .on("click", () => {
        const copy = $.extend({}, this.lastEntry());
        this.entries.push(copy);
        this.save().then(() => this.promise_to_reload_UI());
        // Don't need to resort because the copy is the last entry
        const $table = $("#history > table");
        $table.append(this.$history_tr(this.lastEntry()));
        $history[0].scrollTo(0, $history[0].scrollHeight);
      });
      
      $("#loaded").hide();
      $history[0].scrollTo(0, $history[0].scrollHeight);
		});

    this.$tab.find("button[name='add_record']")
		.off("click")
		.on("click", () => {
      this.addCompressorRecord()
      .then(() => session_time = 0);
    });

		const $change = this.$tab.find("button[name='filters_changed']");
		this.$tab.find("select[name='operator']")
    .on("change", function() {
      const val = $(this).val();
      $change.button(
        "option", "disabled", !val || val.length === 0);
    });
		$change
		.off("click")
		.on("click", () => {
			const record = {};
			this.$form.find(":input").each((i, el) => {
				if (el.name in this.keys)
					record[el.name] = this.deserialise(
						el.name, $(el).val());
			});
      record.filters_changed = true;
			console.debug("Adding filter changed record", record);
			this.add_record(record);
      session_time = 0;
		})
    .button(
      "option", "disabled", true);

    return super.attach_handlers();
  }

  /**
   * One of the form fields has changed, validate the form and
   * update the submit button
   * @private
   */
  validate_form() {
    if (typeof this.$form.valid === "function") {
      this.$tab
      .find("button[name='add_record']")
      .button("option", "disabled", !this.$form.valid());
    }
    const val = this.$tab.find("select[name='operator']").val();
		this.$tab.find("button[name='filters_changed']")
    .button("option", "disabled", !val || val.length === 0);
  }

  /**
   * Set the runtime but not the digits display.
   * @private
   */
  set_runtime(v) {
    this.runtime = v;
    this.$runtime.val(hms(v));

    let delta = (this.length() > 0)
        ? v - this.get(this.length() - 1).runtime : 0;

    const $delta = this.$tab.find(".cr_delta");
    if (delta > 0) {
      $delta.show().text(hms(delta));
    } else
      $delta.hide();
  }

  /**
   * Set the runtime and also the digits display
   * @private
   */
  set_runtime_and_digits(v) {
    this.set_runtime(v);
    this.$form.find("select.digital").each((i, el) => {
      const u = $(el).data("units");
      let dig = Math.floor(v / u);
      dig = (u === 0.01) ? Math.round(dig) : Math.floor(dig);
      $(el).val(dig % 10);
    });
  }

  /**
   * @private
   * On manual change to the digits display, read it and set the runtime
   */
  read_digits() {
    let v = 0;
    this.$form.find("select.digital").each((i, el) => {
      v += $(el).val() * $(el).data("units");
    });
    this.set_runtime(v);
  }

  /**
   * Set the UI for the last run, and the rule for the minimum runtime
   * @private
   */
  set_last_runtime(record) {
		this.set_runtime_and_digits(record.runtime);

    this.$tab.find(".cr_operator").text(record.operator);
    this.$tab.find(".cr_time").text(
      Entries.formatDateTime(record.date));
    this.$tab.find(".cr_flr").text(
      Number(this.remaining_filter_life()).toFixed(2));

    const lc = this.entries.find(e => e.filters_changed);
    this.$tab.find(".cr_flc").text(lc ? lc.date.toLocaleDateString() : "never");
    this.$tab.find(".cr_runtime").text(record.runtime.toFixed(2));

    if (this.$runtime.length === 0)
      return;

    if (this.$runtime.attr("type") === "hidden")
      return;
  }

  /**
   * @private
   * Use an AJAX request to retrieve the latest sample
   * for a sensor
   */
  get_sample(name) {
    const url = new URL(name, SENSOR_URL);
    return $.getJSON(url, {
      t: Date.now() // defeat cache
    });
  }

  reload_ui() {
		return this.loadFromStore()
    .then(() => {
      console.debug("\t", this.length(), this.id,
                 "compressor records");
      const cur = this.lastEntry();
      if (cur)
        this.set_last_runtime(cur);

      // Restart the sensor loop on the fixed compressor
      if (this.id === "fixed")
        this.read_sensors();
      else
        this.set_runtime_and_digits(0);

      // Validate the form
      this.validate_form();

      return this;
    })
    .catch(e => {
      console.debug(`Compressor.reload_ui ${this.id} failed:`, e);
      return this;
    });
  }

  /**
   * @private
   * Update a sampled input field.
   * @param {object?} sample the input sample, or null if no sample
   * could be retrieved
   * data-sample-config further has:
   *     name: the sensor name e.g. intake_temperature
   *     max_age: maximum age for valid samples.
   *     sampled: selector for the element(s) to be shown
   *              when a sample is found and deemed valid.
   *     unsampled: selector for the element(s) to be shown
   *                when the sample is too old or no sample
   *                can be retrieved.
   *     dubious: selector for when the sample value is questionable
   *     enabled: selector for a checkbox
   */
  update_sampled_field($el, sample) {
    const spec = $el.data("sensor-config");
    const id = `${this.id}:${spec.name}`;

    if (sample) {
      const thresh = Date.now() - spec.max_age;
      if (sample.time < thresh) {
        // Sample unavailable or too old
        console.debug(`Sample for ${id} too old`);
        sample = null;
      } else if (spec.enable) {
        const $enable = $(spec.enable);
        if ($enable.length > 0 && !$enable.is(":checked"))
          sample = null;
      }
    }
    //else console.debug(`Sample for ${id} unavailable`);

    if (!sample) {
      $el.prop("readonly", null);
      $(spec.sampled).hide();
      $(spec.dubious).hide();
      $(spec.unsampled).show();
    } else if (sample.dubious) {
      $el.prop("readonly", null);
      $(spec.sampled).hide();
      $(spec.dubious).text(sample.dubious);
      $(spec.dubious).show();
      $(spec.unsampled).hide();
    } else {
      // sample available, trustworthy, and young enough
      $el.prop("readonly", "readonly");
      $el.val(Math.round(sample.sample));
      $(spec.sampled).show();
      $(spec.dubious).hide();
      $(spec.unsampled).hide();
    }

    // Update validation message
    if (typeof this.$form.valid === "function")
      $el.closest(".validated_form").valid();
  }

  /**
   * @private
   * Update the sensor readings from the remote sensor URL
   */
  read_sensors() {

    // Clear any existing timeout
    if (this.sensor_timeoutID)
      clearTimeout(this.sensor_timeoutID);
    this.sensor_timeoutID = null;

    const promises = [
      // Promise to update runtime, This is always sampled.
      this.get_sample("power")
      .then(sample => {
        const rta = this.runtime + sample.sample / (60 * 60 * 1000);
        this.set_runtime_and_digits(rta);
        this.validate_form();
      })
      .catch(() => {
        this.set_runtime_and_digits(this.runtime, true);
      })
    ];
      
    // Promise to update sampled fields. These can be disabled in the
    // settings.
    $(`input[data-compressor=${this.id}][data-sensor-config]`)
    .each((i, el) => {
      const $el = $(el);
      const info = $el.data("sensor-config");
      if (this.config.get(`compressor:${this.id}:enable_${info.name}`)) {
        promises.push(
          this.get_sample(info.name)
          .then(sample => this.update_sampled_field($el, sample))
          .catch(() => this.update_sampled_field($el, null)));
      }
      //else
      //  console.debug(`compressor:${this.id}:enable_${info.name}`,
      //             "sensor is disabled",
      //            this.config.get(`compressor:${this.id}:enable_${info.name}`));
    });

    // Promise to check alarm sensors
    $(`.alarm[data-compressor=${this.id}][data-sensor-config]`)
    .each((i, el) => {
      const $el = $(el);
      if ($el.data("compressor") !== this.id)
        return;
      const info = $el.data("sensor-config");
      if (this.config.get(`compressor:${this.id}:enable_${info.name}`)) {
        promises.push(
          this.get_sample(info.name)
          .then(sample => {
            sample = sample ? sample.sample : 0;
            const $report = $(".fixed_internal_temp");
            $report.html(`${Math.round(sample)}&deg;C`);
            const alarm_temp = this.config.get(
              `compressor:${this.id}:${info.name}_alarm`);
            if (sample >= alarm_temp) {
              $report.addClass("error");
              $el.show();
              if (typeof Audio !== "undefined") {
                const snd = new Audio("sounds/siren.mp3");
                snd.play();
              }
            } else {
              $report.removeClass("error");
              $el.hide();
            }
          }));
      }
    });

    // Check all sensors
    Promise.all(promises)
    .finally(() => {
      const timeout = this.config.get(
        `compressor:${this.id}:poll_frequency`);
      // If poll freq <= 0, don't poll again
      if (timeout > 0) {
        // Queue the next poll
        this.sensor_timeoutID =
        setTimeout(() => this.read_sensors(), timeout);
      }
    });
  }

  /**
	 * Recalcalculate the remaining filter life from the history
	 * @private
	 */
  remaining_filter_life() {
    const details = false;
    const cfg_pre = "compressor:" + this.id + ":filter:";
    const avelife = this.config.get(cfg_pre + "lifetime");
    if (this.length() === 0)
      return avelife;
    const fca = this.config.get(cfg_pre + "a");
    const fcb = this.config.get(cfg_pre + "b");
    const fcc = this.config.get(cfg_pre + "c");
    const fcd = this.config.get(cfg_pre + "d");
    let flr = avelife;
    let runtime = 0;
    if (details)
      console.debug("Compute rfl from", this.length(), "records");
    for (const e of this.entries) {
      if (e.filters_changed) {
        // Filters changed. Zero runtime (or filters
        // changed after runtime) assumed.
        flr = avelife;
        if (details)
          console.debug("Filters changed, lifetime = " + flr);
      } else {
        const dt = (e.runtime - runtime); // hours
        if (dt > 0) {
          // Calculate predicted filter lifetime at this
          // temperature, in hours
          const factor = fcd + (fca - fcd) /
                (1 + Math.pow(e.temperature / fcc, fcb));
          const hours_at_T = avelife * factor;
          if (details)
            console.debug("Predicted lifetime at "
                       + e.temperature +
                       "°C is " + hours_at_T + " hours");
          const used = avelife * dt / hours_at_T;
          if (details)
            console.debug("Run of " + dt + " hours used " + used
                       + " hours of filter life");
          // Fraction of filter change hours consumed
          flr -= used; // remaining filter life
          if (details)
            console.debug("Remaining filter life " + flr
                       + " hours");
        }
      }
      runtime = e.runtime;
    }
    return flr;
  }

  /**
   * Add a new compressor record
   * @return {Promise} promise that resolves to this
   * @private
   */
  add_record(r) {
    if (typeof r.runtime === "undefined")
      r.runtime = 0;
    if (typeof r.filters_changed === "undefined")
      r.filters_changed = false;

    // Reload entries in case they were asynchronously changed
    return this.loadFromStore()
    .then(() => {
      r.date = new Date();
      this.push(r);
      console.debug("Runtime after this event was "
                 + r.runtime + " hours");
      console.debug("New prediction of remaining lifetime is "
                 + this.remaining_filter_life() + " hours");
      return this.save();
    })
    .then(() => this.play_record())
    .then(() => this.promise_to_reload_UI());
  }

  /**
   * Handle a change to a cell in the history table.
   * @param {HTMLElement} el the TD
   * @param {object} entry entry the entry
   * @param {string} name column name e.g. "runtime"
   * @param {string} val new value
	 * @private
   */
  $history_change(td, entry, name, val) {
    const $td = $(td);
    const $tr = $td.closest("tr");

    if (name === "operator" && val === "") {
      // Clearing the operator field removes the row.
      // Remove the entry from the $table. The $table doesn't have
      // all the entries, so have to do some sums
      this.removeEntry(entry);
      $tr.remove();
    } else {
      if (name === "date") {
        val = new Date(val);
        $td.text(val.toISOString()); // clean up the entry
      } else if (HEAD_TYPES[name] === "number") {
        val = parseFloat(val);
        $td.text(val); // clean up the entry
      }
      // Otherwise treat as string
      

      entry[name] = val;
      if (name == "runtime") {
        this.entries.sort((a, b) => {
          if (a.runtime > b.runtime)
            return 1;
          if (a.runtime < b.runtime)
            return -1;
          return 0;
        });
        // Resorting the visible table is not enough, because it'll miss
        // when a sort takes a row out of range. Have to regenerate.
			  $("#history")
        .empty()
        .append(this.$history_table(HISTORY_TRS));
      }
    }
    this.save()
    // promise_to_reload_UI will invoke reload_ui which will call
    // set_last_runtime to set the form
    .then(() => this.promise_to_reload_UI());
  }

  /**
   * Construct a cell for the DOM history table. Doesn't get added
   * to the table.
   * @param {object} entry entry in this.entries
   * @param {string} name column name e.g. "runtime"
   * @param {string} text current value
   * @return {jQuery} the $TD
	 * @private
   */
  $history_td(entry, name) {
    let val = entry[name];

    if (name === "date") {
      val = val.toISOString();
    } else if (HEAD_TYPES[name] === "number")
      val = Number(val).toFixed(2);

    const $td = $(`<div class='table-cell' name="${name}">${val}</div>`);
    $td.data("type", HEAD_TYPES[name]);
    
    const compressor = this;
    $td.on("click", () => {
      $td.edit_in_place({
        changed: function(v) {
          return compressor.$history_change(this, entry, name, v);
        }
      });
    });

    return $td;
  }

  /**
   * Construct a row for the DOM history table. Doesn't get added
   * to the table.
   * @param {object} entry entry in this.entries
   * @return {jQuery} the TR
	 * @private
   */
  $history_tr(entry) {
    const heads = this.getHeads().filter(h => h !== "filters_changed");
    const $tr = $("<div class='table-row'></div>");
    if (entry.filters_changed) {
      $tr.append(
        this.$history_td(entry, "date", entry.date.toISOString()));
      $tr.append(
        this.$history_td(entry, "operator", entry.operator));
      $tr.append(`<div class='table-cell'FILTERS CHANGED</div>`);
    } else {
      for (const head of heads)
        $tr.append(this.$history_td(entry, head));
    }
    return $tr;
  }

  /**
   * Resort the history DOM table by runtime.
	 * @private
   */
  $history_resort() {
    const $table = $("#history");

    function getRT(row) {
      const t = $("[name=runtime]", row).text();
      return parseFloat(t);
    }

    const rows = $table
          .find('div.table-row:gt(0)')
          .toArray()
          .sort((a, b) => getRT(a) - getRT(b));

    // The action of re-appending the row to the table will remove it
    // from its old position
    for (const row of rows)
      $table.append(row);
  }

	/**
   * Construct a new history table
   * @param {number} num_records max number of entries in the table
   * @return {jQuery} the constructed table
	 * @private
	 */
  $history_table(num_records) {
    const ents = this.getEntries();   
    const heads = this.getHeads().filter(h => h !== "filters_changed");
    const $table = $("<div class='table'></div>");
    
    // Construct header row
    const $tr = $("<div class='table-row'></div>");
    heads.forEach(h => $tr.append(`<div class="table-cell">${h}</div>`));
    $table.append($tr);

    const start = ents.length - num_records;
    for (let i = start < 0 ? 0 : start; i < ents.length; i++)
      $table.append(this.$history_tr(ents[i]));
    
    return $table;
  }

  /**
   * Determine if the compressor should be operated under given
   * conditions of temperature and humidity. See README.md for details.
   */
  operable() {
    // See https://www.conservationphysics.org/atmcalc/atmoclc2.pdf

    const temperature = parseFloat(this.$form.find("input[name='temperature']").val());
    const humidity = parseFloat(this.$form.find("input[name='humidity']").val());
    // Saturation vapour (partial) pressure
    const sat = 610.78 * Math.exp(17.2694 * temperature / (temperature + 238.3)); // pascals

    // Concentration at saturation
    const conc1 = 2.166 * sat / (temperature + 273.16); // g/m^3

    // Adjust for relative humidity
    const conc2 = conc1 * humidity / 100;

    // Subtract the acceptable upper limit for nitrox (0.02g/m^3)
    if (conc2 <= 0.02)
      return true; // very dry already
    const conc3 = conc2 - 0.02;

    const pumping_rate = this.config.get(
      "compressor:" + this.id + ":pumping_rate"); // l/min
    const purge_freq = this.config.get(
      "compressor:" + this.id + ":purge_freq"); // mins
    const air_per_purge = pumping_rate * purge_freq / 1000; // m^3

    // Volume of condensate expected to be generated during 1
    // purge period
    const ml = conc3 * air_per_purge; // g ~ ml

    const threshold = this.config.get(
      "compressor:" + this.id + ":safe_limit"); // ml

    //console.debug(temperature, humidity, sat, conc1, conc2, ml, "<", threshold,"?");
    return ml <= threshold;
  }
}

export { Compressor }
