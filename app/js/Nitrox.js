/*@preserve Copyright (C) 2018-2024 Crawford Currie http://c-dot.co.uk license MIT*/
/* eslint-env browser,jquery */

import { Entries } from "./Entries.js";
import { NitroxBlender } from "./NitroxBlender.js";

/**
 * Nitrox calculation tab and data store
 */
class Nitrox extends Entries {

  /**
   * Configuration object
   * @member {Config}
   */
  config;

  /**
   * Shortcut to the form in the Entries.$tab
   * @member {jQuery}
   */
  $form;

	/**
   * £ per L of the cheapest O2, used in bleed calculations
   * @member {number}
   */
  O2_gbp = 1000000;

  /**
   * Pending reports, waiting to be pushed into the Entries when
   * the button is pushed.
   */
  reports = [];

  init(params) {
		return super.init($.extend(params, {
			file: "nitrox.csv",
      keys: {
        // Type map
        date: "Date",
        blender: "string",
        bank: "string",
        litres: "number",
        bar_left: "number",
        cost: "number"
      }
		}));
	}

	//@override
	attachHandlers() {
    const nitrox = this;
    const $tab = this.$tab;
		this.$form = $tab.children("form");

    $("#nitrox")
    .children("form")
    .on("submit", e => e.preventDefault());
    
    $tab.find("input")
		.on("change", () => this.recalculate());

		$tab.find("[name=fix_bank]")
		.on("click", () => this._fixBank());
		
		$tab.find("[name=report]>div")
		.addClass("hidden");
		
		$tab.find("[name=report]>div").hide();

		$tab.find("[name=pick_blend]")
		.on("change", evt => {
			$tab.find("[name=report]>div")
			.hide();
			$tab.find(`[name=report]>[name=${evt.target.value}]`)
			.show();
		});
		$tab.find("[name=pick_blend]:checked")
		.each((i, el) => {
			$tab.find(`[name=report]>[name=${el.value}]`)
			.show();
		});

		$tab.find("[name=blender]")
		.on("change", function() {
			if ($(this).val()) {
				$tab.find("[name=blender-sel]").show();
				$tab.find("[name=no-blender-sel]").hide();
        nitrox.recalculate();
			} else {
				$tab.find("[name=blender-sel").hide();
				$tab.find("[name=no-blender-sel]").show();
			}
		});

    $tab.find("button[name='add_record']")
		.on("click", () => this._addO2Record())
    .button("option", "disabled", true);

    return super.attachHandlers();
	}

	// dialog to fix bank levels
	_fixBank() {
		const $dlg = $("#fix_bank_dialog");
		const $banks = $dlg.find("[name=banks]").empty();
		const banks = this.config.store_data.o2.bank;
		for (const id in banks) {
			$banks.append(`<label for="nox_fixbank_${id}">${id}: </label>`);
			const $cyl = $(`<input type="number" name="nox_fixbank" id="nox_fixbank_${id}" value="${banks[id].bar}" class="integer3"/>`);
			$banks.append($cyl);
			$banks.append(" bar<br/>");
			$cyl.on("change", () => {
				const newp = $cyl.val();
				banks[id].bar = newp;
				this.reloadUI();
			});
    }
    $dlg.dialog({})
    .dialog("open");
	}

	/**
   * @override
   * @return {Promise} promise that resolves to this
   */
  reload_ui() {
		// Reset banks to default state
		const $bank = this.$tab.find(".nox_o2_bank");
		$bank.empty();
		// re-init from config
		const banks = this.config.store_data.o2.bank;
		
		// Even if the cheapest bank isn't selected, we need
		// use the O2 value for the bleed computations.
		this.O2_gbp = 1000000;
		for (const id in banks) {
			$bank.append(`<label for="nox_bank_${id}">${id}</label>`);
			const $choice = $(`<input type="checkbox" name="nox_bank" id="nox_bank_${id}" value="${id}" checked="checked" />`);
			$bank.append($choice);
			$choice.checkboxradio({
				label: `${id} (${banks[id].bar} bar, ${banks[id].price}/ℓ)`
			});
			$choice.on("change", () => this.recalculate());
			if (banks[id].price < this.O2_gbp)
				this.O2_gbp = banks[id].price;
		}
		console.debug(`Cheapest O2 ${this.O2_gbp}`);

		$("input[name=nox_bank]")
		.on("change", () => this.recalculate());

    return this.loadFromStore()
    .then(() => {
      if (this.length() > 0) {
			  console.debug(`Loading ${this.length()} O2 records`);
			  for (let i = 0; i < this.length(); i++) {
				  const cur = this.get(i);
				  // adjust
				  banks[cur.bank].bar = cur.bar_left;
				  this.$tab
				  .find(`[name='bank_${cur.bank}']`)
				  .text(cur.bar_left);
			  }
        this.recalculate();
      } else
        console.debug("No nitrox records found");
      return this;
    })
    .catch(e => {
      console.error("Nitrox load failed: " + e, e);
      return this;
    });
  }

	expandActions(actions) {
    /* eslint-disable no-unused-vars */
		function morethan(x,y) {
			return x >= y;
		}

		function round(v) {
			return Math.round(v);
		}

		function floor(v) {
			return Math.floor(v);
		}

		function ceil(v) {
			return Math.ceil(v);
		}

		function about(v) {
			return round(v * 100) / 100;
		}
    /* eslint-enable no-unused-vars */

		let acts = "";
		const $templates = $("#action-templates");
		for (let n = 0; n < actions.length; n++) {
			const a = actions[n];
			const text = $templates.find(`[name=${a.action}]`).html();
			let act;
			eval("act=`" + text + "`");
			acts += `<div class='nitrox-step'>${n + 1}. ${act}</div>`;
		}
		return acts;
	}

  recalculate() {
    const conditions = {};

    // temperature: deg C (only needed for real gas approximation)
    // cylinder_size: litres
    // start_mix: percent
    // start_pressure: bar
    // target_mix: percent
    // target_pressure: bar
    // O2_bank_size: litres
    // O2_bank_pressure: bar
    // ppO2max: max ppO2
    this.$tab.find(":input").each(function () {
      if (this.type === "number")
        conditions[this.name] = parseFloat($(this).val());
      else
        conditions[this.name] = $(this).val();
    });

    const MOD = Math.floor((100 * conditions.ppO2max
                            / conditions.target_mix - 1) * 10);
    $("#nox_MOD").text(MOD);

    // Actions list used to fill in template for display in HTML
		const actions = [];
    // Report that is saved to Entries
    const reports = this.reports = [];
    const blender = this.$tab.find("[name=blender]").val();
		//let drained_l = 0;
		//let wasted_l = 0;
		let used_l = 0;
		let cost_gbp = 0;
		function action(a) {
			actions.push(a);
			switch (a.action) {
			case "Bleed":
				//drained_l += a.drained_l;
				//wasted_l += a.wasted_l;
				break;
			case "AddFromBank":
				reports.push({
          date: new Date(),
          blender: blender,
          bank: a.bank,
          litres: a.used_l,
          bar_left: a.left_bar,
          cost: a.cost_gbp
        });
				cost_gbp += a.cost_gbp;
				break;
			}
		}

    console.debug("Blending conditions", conditions);

		// Given:
		// Ps = start pressure in cylinder
		const filler = new NitroxBlender({
			// T = ambient temperature in degrees C
      T: conditions.temperature ?? 20,
      // Ps = start pressure in cylinder
			Ps: conditions.start_pressure,
			// Ms = start mix in cylinder
			Ms: conditions.start_mix / 100,
			// Sc = cylinder size
			Sc: conditions.cylinder_size,
			// Pd = target pressure
			Pd: conditions.target_pressure,
			// Md = target mix
			Md: conditions.target_mix / 100,
			// Pf = pressure of fill gas (gas required from the O2 bank)
			// Mf = mix of the fill gas (O2 = 1)
			Mf: 1,
			// Pt = pressure of top-off gas (air)
			// Mt = mix of top-off gas (air = 0.209)
			Mt: 0.209,
			// Min price of O2
			O2_gbp: this.O2_gbp,

			action: action
		});

		// copy the selected banks
		const banks = [];
		this.$tab.find("input[name=nox_bank]:checked")
		.each(
			(i, checkbox) => {
				const name = $(checkbox).val();
				const cyl = this.config.store_data.o2.bank[name];
				banks.push({
					name: name,
					bar: cyl.bar,
					size: cyl.size,
					price: cyl.price
				});
			});

    const $report = this.$tab.find("[name=report]");
    if (filler.blend(banks)) {
			if (cost_gbp > 0) {
				actions.push({
					action: "Pay",
					cost_gbp: cost_gbp
				});
        // Enable record keeper
        this.$tab
        .find("button[name='add_record']")
        .button("option", "disabled", false);
      } else {
        this.cost_gbp = 0;
        this.last_fill = undefined;
        // disable record keeper
        this.$tab
        .find("button[name='add_record']")
        .button("option", "disabled", true);
      }
    }
		$report.html(this.expandActions(actions));
  }

  _addO2Record() {
		console.debug("Adding O2 record", this.reports);
    for (const r of this.reports)
      this.push(r);
    this.reports = [];
    this.$tab
    .find("button[name='add_record']")
    .button("option", "disabled", true);
    this.save()
    .then(() => this.play_record());
  }
}

export { Nitrox }

