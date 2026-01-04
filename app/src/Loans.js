/*@preserve Copyright (C) 2018-2026 Crawford Currie http://c-dot.co.uk license MIT*/
/* eslint-env browser,jquery */

// See comment in index.html import "jquery-tablesorter";

import { Entries } from "./Entries.js";

import "./jq/edit-in-place.js";
import "./jq/select-in-place.js";

/**
 * Entries for Loan events. These can be edited in place.
 */
const SELECT_BUTTON = "SeLeCt";

// Defaults used to populate the new entry row, fields in this.capture
const DEFAULTS = {
  date: new Date(),
  item: SELECT_BUTTON,
  count: 1,
  borrower: SELECT_BUTTON,
  lender: SELECT_BUTTON,
  donation: 0
};

/**
 * Load records. Read from/saved to loans.csv in the cache.
 */
class Loans extends Entries {

  /**
   * Captured data in last row: date, item, count, borrower, lender, donation
   * @member {object}
   */
  capture = undefined;

  init(params) {
    return super.init($.extend(params, {
      file: "loans.csv",
      keys: {
        date: "Date",
        item: "string",
        count: "number",
        borrower: "string",
        lender: "string",
        donation: "number",
        returned: "string"
      }
    }));
	}

	//@override
  loadUI() {
    return super.loadUI()
    .then(() => {
      this.$loan_controls = this.$tab.find("#loan_controls");
      this.$loan_table = this.$tab.find("#loan_table");
      return this;
    });
  }

	//@override
	attach_handlers() {
		this.$loan_controls.hide();

		this.$tab.find("#loan_save")
    .on("click", () => {
			this.$tab.find(".loan_modified").each((i, el) => {
				$(el).removeClass("loan_modified");
			});
			// Save to file
			this.save()
			.then(() => {
				this.$loan_controls.hide();
				$(document).trigger("reload_ui");
			});
		});

		this.$tab.find("#loan_reset")
    .on("click", () => {
			this.$tab.find(".loan_modified").each((i, el) => {
				$(el).removeClass("loan_modified");
			});
			// Reload from file
			this.reset();
			$(document).trigger("reload_ui");
			this.$loan_controls.hide();
		});

		this.$tab.find("#loan_show_all")
    .on("change", () => {
			$(document).trigger("reload_ui");
		});

		// Add whatever is in 'capture' as a new loan (after validation)
		this.$tab.find("#loan_add")
    .on("click", () => {
			const bad = [];
			try {
				if (new Date(this.capture.date) > new Date())
					bad.push("date");
			} catch (e) {
        console.debug(e);
				bad.push("date");
			}
			if (this.capture.item == DEFAULTS.item)
				bad.push("item");
			try {
				if (parseInt(this.capture.count) < 0)
					bad.push("count");
			} catch (e) {
        console.debug(e);
				bad.push("count");
			}
			try {
				if (parseFloat(this.capture.donation) < 0)
					bad.push("donation");
			} catch (e) {
        console.debug(e);
				bad.push("donation");
			}
      const $tab = this.$tab;
			Promise.all([
				this.app.roles.find("role", "member")
				.then(row => {
					if (row.list.split(",").indexOf(this.capture.borrower) < 0)
						bad.push("borrower");
				})
				.catch(() => {
					bad.push("borrower");
				}),
				this.app.roles.find("role", "operator")
				.then(row => {
					if (row.list.split(",").indexOf(this.capture.lender) < 0)
						bad.push("lender");
				})
				.catch(() => {
					bad.push("lender");
				})
			]).then(() => {
				if (bad.length == 0) {
					this.$loan_table.find("tfoot")
					.find(".loan_modified")
					.removeClass("loan_modified");
					this.push($.extend({}, this.capture));
					this.save().then(() => {
						this.reset();
						$(document).trigger("reload_ui");
					});
				} else {
					$.each(bad, function (i, e) {
						$tab.find("#loan_dlg_" + e).addClass("error");
					});
				}
			});
    });
    return super.attach_handlers();
  }

  mark_loan_modified($td) {
    // Table body are td, tfoot are th
    if ($td.is("td")) {
      $td.addClass("loan_modified");
      this.$loan_controls.show();
    }
  }

  /*
   * construct_*_cell functions are used for table cells in the body
   * and also for the cells in the foot that capture new loans
   */

  /**
   * Construct an inventory table cell, for a number field
   * @param {number|jquery} e if e is a number, then construct a new table
   * cell and get fields from the databse. If it's a jQuery object, then get
   * the fields from this.capture.
   * @param {string} field field name e.g. "count"
   * @param {boolean?} isInteger true to constrainn value
   * @private
   */
  construct_number_cell(e, field, isInteger) {
    let entry, $td;
    if (typeof e === "number") {
      entry = this.get(e);
      $td = $("<div class='table-cell centred'></div>");
    } else
      $td = e, entry = this.capture;

    const type = this.keys[field];
    let text = entry[field];

    if (type === "Date")
      text = Entries.formatDate(text);
    $td.text(text);

    $td
    .off("click")
    .on("click", function () {
      $td.removeClass("error");
      $(this).edit_in_place({
        changed: function (s) {
          if (s !== entry[field]) {
            const v = Number(s);
            if (isNaN(v) || isInteger && !v.isInteger())
              $td.addClass("error");
            else {
              if ($td.is("td"))
                $td.addClass("loan_modified");
              entry[field] = s;
              $td.text(s);
            }
          }
          return s;
        }
      });
    });

    return $td;
  }

  /**
   * Construct a select field, for Borrower and Lender and Returned fields
   * @param {number|jquery} el table cell, or index
   * @param {string} field field name
   * @param {string?} set set to look up in roles e.g. "operator"
   * @private
   */
  construct_select_cell(e, field, set) {
    let entry, $td;
    if (typeof e === "number") {
      entry = this.get(e);
      $td = $("<div class='table-cell'></div>");
    } else
      $td = e, entry = this.capture;
    const text = entry[field];
    if (text === SELECT_BUTTON)
      $td.addClass("centred").append("<button>select</button}");
    else
      $td.text(text);

    $td
    .off("click")
    .on("click", () => {
      $td.removeClass("error");
      this.app.roles.find("role", set)
      .then(row => {
        $td.select_in_place({
          changed: s => {
            if (s != entry[field]) {
              entry[field] = s;
              $td.text(s);
              $td.removeClass("error");
              this.mark_loan_modified($td);
            }
            return s;
          },
          initial: text,
          options: row.list.split(",")
        });
      })
      .catch(e => {
        console.debug(e);
        $.alert({
          title: `'${set}' list`,
          content: e.toString()
        });
      });
    });
    return $td;
  }

  /**
   * Construct an inventory table cell, for a date field
   * @param {number|jquery} e if e is a number, then construct a new table
   * cell and get fields from the databse. If it's a jQuery object, then get
   * the fields from this.capture.
   * @param {string} field field name e.g. "date"
   * @private
   */
  construct_date_cell(e, field) {
    let $td, entry;
    if (typeof e === "number") {
      entry = this.get(e);
      $td = $("<div class='table-cell centred'></div>");
    } else
      entry = this.capture, $td = e;

    const date = entry[field];
    if (typeof date !== "undefined")
      $td.text(Entries.formatDate(date));
    else
      $td.text("?");

    $td
    .off("click")
    .on("click", function (e) {
      $td.removeClass("error");
      $(this).datepicker(
        "dialog", entry[field],
        date => {
          date = new Date(date);
          if (date != entry[field]) {
            entry[field] = date;
            $td.text(Entries.formatDate(date));
						this.mark_loan_modified($td);
          }
        }, {
          dateFormat: "yy-mm-dd"
        },
        e);
    });
    return $td;
  }

  /**
   * Construct an inventory item field, for a rented item
   * @param {number|jquery} e if e is a number, then construct a new table
   * cell and get fields from the databse. If it's a jQuery object, then get
   * the fields from this.capture.
   * @private
   */
  construct_item_cell(e) {
    let entry, $td;
    if (typeof e === "number") {
      entry = this.get(e);
      $td = $(`<div class='table-cell'></div>`);
    } else
      entry = this.capture, $td = e;

    const text = entry.item;
    if (text === SELECT_BUTTON)
      $td.addClass("centred").append("<button>select</button}");
    else
      $td.text(text);

    $td
    .off("click")
    .on("click", () => {
      $td.removeClass("error");
      $("#inventory_pick_dialog")
      .data("picked", entry.item)
      .data("handler", item => {
        entry.item = item;
        $td.text(item);
        this.mark_loan_modified($td);
      })
      .dialog("option", "title",
              ($td.is("td") ? "Change" : "Select new") + " loan item")
      .dialog("open");
    });
    return $td;
  }

  // The tbody is where current loans are recorded
  load_tbody () {
    const order = this.$loan_table.data("order").split(",");
    const $tbody = this.$loan_table.find(".table-row-group");
    $tbody.empty();

    const show_all = this.$tab.find("#loan_show_all").is(':checked');
    let someLate = false;
    this.each((row, r) => {
      const active = (typeof row.returned === "undefined" ||
                      row.returned === "");
      if (!active && !show_all)
        return;
      const $row = $("<div class='table-row'></div>");
      let isLate = false;
      if (active) {
        const due = row.date.valueOf() +
              this.config.get("loan_return") * 24 * 60 * 60 * 1000;
        if (due < Date.now()) {
          isLate = true;
          someLate = true;
        }
      }
      for (let c = 0; c < order.length; c++) {
        switch (order[c]) {
        case 'date':
          $row.append(this.construct_date_cell(r, "date"));
          break;
        case 'count':
          $row.append(this.construct_number_cell(r, "count", true));
          break;
        case 'item':
          $row.append(this.construct_item_cell(r));
          break;
        case 'borrower':
          $row.append(this.construct_select_cell(r, "borrower", "member"));
          break;
        case 'lender':
          $row.append(this.construct_select_cell(r, "lender", "operator"));
          break;
        case 'donation':
          $row.append(this.construct_number_cell(r, "donation"));
          break;
        case 'returned':
          $row.append(this.construct_select_cell(r, "returned", "operator"));
          break;
        }
      }
      if (isLate)
        $row.addClass("loan_late");
      $tbody.append($row);
    });
    this.$tab.find("#loan_some_late").toggle(someLate);
  }

  // The tfoot is where new loans are entered
  load_tfoot() {
    const order = this.$loan_table.data("order").split(",");

    const $tfoot = this.$loan_table.find(".table-foot-group");
    $tfoot.find(".loan_modified")
    .removeClass("modified");

    let $col = $tfoot.find(".table-cell").first();
    for (let i = 0; i < order.length; i++) {
      switch (order[i]) {
      case 'date': this.construct_date_cell($col, "date"); break;
      case 'count': this.construct_number_cell($col, "count", true); break;
      case 'item': this.construct_item_cell($col); break;
      case 'borrower':
        this.construct_select_cell($col, "borrower", "member"); break;
      case 'lender':
        this.construct_select_cell($col, "lender", "operator"); break;
      case 'donation': this.construct_number_cell($col, "donation"); break;
      }
      $col = $col.next();
    }
  }

  /**
   * @override
   * @return {Promise} promise that resolves to this
   */
  reload_ui() {
    return this.loadFromStore()
    .then(() => {
      console.debug("Loading " + this.length() + " loan records");
      this.load_tbody();
      this.capture = $.extend({}, DEFAULTS);
      this.load_tfoot();
      this.$loan_table.trigger("updateAll");
      /*See comment in index.html
        this.$loan_table.tablesorter({
        cancelSelection: true,
        selectorHeaders: "> div.table-head-group div.table-head-cell",
        selectorSort: "div.table-head-cell",
        headerTemplate: '{content}<a href="#">{icon}</a>',
        widgets: ['columns', 'uitheme'],
        theme: 'jui',
        delayInit: true,
        dateFormat: "ddmmyyyy"
        });*/
      return this;
    })
    .catch(e => {
      console.debug("Loans.reload_ui failed:", e);
      return this;
    });
  }

  save_changes() {
    this.save().then(() => {
			this.reset();
      $(document).trigger("reload_ui");
    });
  }

  number_on_loan(item) {
    let on_loan = 0;
    this.each(row => {
      const active = (typeof row.returned === "undefined" ||
                      row.returned === "");
      if (active && row.item === item)
        on_loan += row.count;
    });
    return on_loan;
  }
}

export { Loans }
