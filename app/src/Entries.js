/*@preserve Copyright (C) 2018-2024 Crawford Currie http://c-dot.co.uk license MIT*/
/* eslint-env jquery */

import "jquery";

/**
 * Generic handling for storing lists of key-value maps in CSV files.
 * Requires the jQuery CSV plugin.
 *
 * For example, a data set such as:
 *
 * a,b,c
 * x,y,z
 * i,j,k
 *
 * will be loaded as:
 *
 * [
 *   { a:x, b:y, c:z },
 *   { a:i, b:j, c:k }
 * ]
 * 
 * if asArrays if false, or if it's true:
 * 
 * [ x, y, z ],
 * [ i, j, k ]
 *
 * In either case getHeads() will return a list of column headings.
 *
 * Note that the first row in the loaded array is used to determine
 * the keys when saving. Keys in later entries that are not in the
 * first entry will be lost.
 *
 */
class Entries {

  /**
   * Unique id for the entries e.g. "fixed" for the fixed compressor.
   * Used to look up parts in jQuery
   * @member {string}
   */
  id = "unknown";

  /**
   * Shortcut to $("#id")
   * @member {jQuery}
   */
  $tab = undefined;

  /**
   * List of entries
   * @member {object[]}
   */
  entries = [];

  /**
   * List of column headings for CSV, loaded from first row
   * of data.
   * @member {string[]}
   */
  heads = [];

  /**
   * Map of column name to data type.
   * @member {Map<string,string>}
   */
  keys = undefined;

  /**
   * Has the data been loaded?
   * @member {boolean}
   */
  loaded = false;

  /**
   * Root URL for loading. `file` will be appended.
   * @member {string}
   */
  url = undefined;
  
  /**
   * Store for load/save
   * @member {AbstractStore}
   */
  store = undefined;

  /**
   * Whether to load as arrays or as maps. See class description
   * for more.
   */
  asArrays = false;

  /**
   * Key within the store for this object
   * @member {string}
   */
  file = undefined;

  /**
   * Optional pointer to the containing App. Not used
   * by this class, but subclasses will use it to cross-reference
   * between tabs.
   * @member {App}
   */
  app = undefined;

	/**
	 * @param {object} params parameters. Any of the fields may
   * be initialised this way. This can't be done by passing params
   * to the constructor, otherwise locally declared fields in
   * subclasses will blow away fields set from params in the base
   * class :-(
   * @return {Promise} promise that resolves when init is complete
	 */
  init(params) {
		for (const field in params)
			this[field] = params[field];
    return this.reset();
	}

	/**
	 * Promise to load the HTML.
	 * Override in subclasses, calling the superclass.
   * @return {Promise} promise that resolves to this
	 */
	loadUI() {
    console.debug(`Loading html/${this.id}.html`);
		return $.get(`html/${this.id}.html?nocache=${Date.now()}`)
		.then(html => {
			const $tab = $(`<div id="${this.id}"></div>`);
			$tab.html(html);
			$("#main_tabs").append($tab);
			this.$tab = $tab;

			$tab.find(".spinner").spinner();
			$tab.find("button").button();
			$tab.find("input[type='checkbox']").checkboxradio();
			$tab.find('.ui-spinner-button').click(function () {
				$(this).siblings('input').change();
			});
			console.debug("Loaded", this.id);
      return this;
		});
  }

	/**
	 * Attach handlers, such as button click handlers, to the
	 * elements in the tab. NOP if there are no handlers.
   * @return {Promise} promise resolving to this
	 */
	attach_handlers() {
    return Promise.resolve(this);
	}

	/**
	 * Promise to reload the UI with new data. NOP unless the UI
	 * is loaded, as indicated by $tab. Normally not overridden -
   * implement reload_ui instead.
   * @return {Promise} promise that resolves to this
	 */
	promise_to_reload_UI() {
		if (this.$tab) {
			console.debug("Reloading", this.id);
			return this.reload_ui();
		}
		return Promise.resolve(this);
	}

	/**
	 * Re-read the store and populate the tab with the data read.
	 * Pure virtual, subclasses must implement.
   * @return {Promise} promise that resolves to this
	 */
	reload_ui() {
		throw new Error("Pure virtual");
	}

  /**
   * Reset and force reload at the next opportunity
	 * @return {Promise} resolves to this when done
   */
  reset() {
    this.entries = [];
    this.heads = [];
    this.loaded = false;
		return Promise.resolve(this);
  }

  /**
	 * Get the number of entries
	 * @return {number}
	 */
  length() {
    return this.entries.length;
  }

  /**
	 * Get the given entry
   * @param {number} i index of the entry.
	 * @return {object} the entry, or undefined if i is out of range.
	 */
  get(i) {
    if (i < 0 || i >= this.entries.length)
      return undefined;
    return this.entries[i];
  }

  /**
   * Get the last entry
   * @return {object} the last entry, or undefined if there are
   * no entries.
   */
  lastEntry() {
    if (this.entries.length > 0)
      return this.entries[this.entries.length - 1];
    return undefined;
  }

  /**
   * Find the index of an entry
   * @param {object} entry the entry to find
   * @return {number} index of the entry, or -1 if not found
   */
  findIndex(entry) {
    return this.entries.findIndex(e => e === entry);
  }

  /**
   * Remove the entry at the given index
   * @param {number|object} index index of the entry to remove, or the
   * entry itself.
   * @return {number} the (old) index of the entry that was removed
   */
  removeEntry(index) {
    if (typeof index !== "number")
      index = this.findIndex(index);
    if (index < 0 || index >= this.entries.length)
      throw new Error(`No entry ${index}`);
    this.entries.splice(index, 1);
    return index;
  }

  /**
   * Return a promise to find the row that has "col":val.
   * resolve is called with the row object.
   * @param col name of the column to search
   * @param val value to search for
   * @return {Promise} the promise
   */
  find(col, val) {
    return new Promise((resolve, reject) => {
      for (const e of this.entries) {
        if (e[col] == val) {
          resolve(e);
          return;
        }
      }
      reject(new Error(`${val} not found in ${col}`));
    });
  }

  /**
	 * Push a new entry
	 * @param {object} r the entry
	 */
  push(r) {
    this.entries.push(r);
  }

  /**
	 * Get a simple array of column heads
   * @return {string[]}
	 */
  getHeads() {
    return this.heads;
  }

  /**
	 * Get a simple array of entries
   * return {object[]}
	 */
  getEntries() {
    return this.entries;
  }

  /**
	 * Make a simple ISO date string. Like Date.toLocaleDateString but for
   * ISO dates.
   * @param {Date} date a date
   * @return {string} the string
	 */
  static formatDate(date) {
    return date.toISOString().replace(/T.*/, "");
  }

  /**
	 * Make a simple date/time string. Like Date.toISOString but
   * with the seconds stripped off.
   * @param {Date} date a date
   * @return {string} the string
	 */
  static formatDateTime(date) {
    return date.toISOString().replace(/T(\d\d:\d\d).*/, " $1");
  }

	/**
   * Load this thing from the store. Note that this method always
   * resolves, even if there's a read failure.
   * @return {Promise} promise that resolves to this
	 */
  loadFromStore() {
		console.debug("loadFromStore of", this.id);
    if (this.loaded) {
			console.debug("\talready loaded");
      return Promise.resolve(this);
		}

    let lp;
    if (this.url)
      lp = $.ajax({
        url: this.url,
        data: {
          t: Date.now()
        },
        dataType: "text"
      });
    else
      lp = this.store.read(this.file);

    return Promise.all([
      lp,
      import('jquery-csv')
    ])
    .then(res => {
      const text = res[0];
      if (typeof text !== "undefined") {
        const data = $.csv.toArrays(text);
        if (this.asArrays) {
          this.heads = data.shift();
          this.entries = data;
        } else {
          this.heads = data[0];
          this.entries = [];
          for (let i = 1; i < data.length; i++) {
            this.entries.push(this.array2map(this.heads, data[i]));
          }
        }
      }
      this.loaded = true;
      return this;
    })
    .catch(e => {
      if (typeof e === "object" && e.html)
        e = e.html;
      console.debug("(debug) error reading " + (this.url || this.file) +
                 ": ", e);
      this.heads = [];
      this.entries = [];
      this.loaded = true;
      return this;
    });
  }

  /**
   * Apply a function to each entry. Like jQuery each except the
   * callback params are reversed
   * @param {function} callback takes (e, i) where e is the entry
   * and i is the index
   */
  each(callback) {
    $.each(this.entries, (i, e) => callback(e, i));
  }

  /**
	 * Cannot save unless store is defined
	 */
  save() {
    if (!this.loaded)
      throw "Can't save, not loaded";
    if (!this.store)
      throw "Can't save, no store";

    const heads = Object.keys(this.keys);
    const data = [heads];
    for (const row of this.entries) {
      if (this.asArrays)
        data.push(row);
      else
        data.push(this.map2array(heads, row));
    }
    return this.store.write(this.file, $.csv.fromArrays(data));
  }

  /**
   * Given an array of values and a same-sized array of keys,
   * create an object with fields key:value after applying type
   * conversions.
   * @param {string[]} keys Array of keys
   * @param {string[]} vals Array of values
   * @return {object} the object mapping keys to vals
   */
  array2map(keys, vals) {
    const datum = {};
    for (let j = 0; j < keys.length; j++) {
      const val = vals[j];

      if (typeof val === "undefined")
        continue; // ignore undefined

      // Apply type conversions
      datum[keys[j]] = this.deserialise(keys[j], val);
    }
    return datum;
  }

  /**
   * Given a key and some data, convert that to the target type
   * for that key
   * @param {string} key the key
   * @param {string} val the data
   * @return {object} the converted value
   */
  deserialise(key, val) {
    if (typeof val === "undefined")
      return val;
    switch (this.keys[key]) {
    case 'Date':
      if (/^[0-9]+$/.test(val))
        // Numeric date (ms since 1/1/70)
        return new Date(parseInt(val));
      // String date
      if (val === "")
        return undefined;
      return new Date(val);
    case 'number':
      if (val === "")
        return 0;
      return parseFloat(val);
    case 'boolean':
      // "on", "true" "yes", and "1" are taken as true.
      // Anything else as false.
      return (/^\s*(true|1|on|yes)\s*/i.test(val));
    default:
      return val;
    }
  }

  /**
   * Given a key and an object, convert that to a suitable type for
   * serialisation in CSV
   * @param {string} key the key
   * @param {object} val the data
   * @return the converted value
   */
  serialise(key, val) {
    if (typeof val !== "undefined"
        && (this.keys[key] === "Date" || val instanceof Date)) {
      // Dates are serialised as simplified ISO8601 strings
      try {
        return val.toISOString();
      } catch (e) {
        console.debug(e);
      }
    }
    return val;
  }

	/**
   * Given an array of keys and a map from key name to value,
   * create an array of serialised values in the same order as keys.
   * create an object with fields key:value after applying type
   * conversions.
   * @param {string[]} keys Array of key names
   * @param {Map[<string,object>} vals Map of key to value
   * @return {string[]} the array
	 */
  map2array(keys, vals) {
    const datum = [];
    for (let j = 0; j < keys.length; j++) {
      const key = keys[j],
            val = vals[key];
      datum.push(this.serialise(key, val));
    }
    return datum;
  }

  play_record() {
    if (typeof Audio !== "undefined") {
      // Sounds are numbered 0..130
      const pick = Math.floor(Math.random() * 131);
      try {
        const snd = new Audio(`sounds/${pick}.mp3`);
        snd.play();
      } catch (e) {
        console.debug("Cannot play", e);
      }
    }
  }
}

export { Entries }

