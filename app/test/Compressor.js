/*@preserve Copyright (C) 2018-2024 Crawford Currie http://c-dot.co.uk license MIT*/
/*eslint-env node, mocha */

import { assert } from "chai";

import { AbstractStore } from "../js/AbstractStore.js";
import { Config } from "../js/Config.js";
import { setup$, UNit } from "./Fixtures.js";

// CSV column headings
const stdheads = [
  "date","operator","temperature","humidity", "runtime","filters_changed"
];

// Filter life degradation rates at different temperatures
// T: F
// See Compressor.md 'Filter life prediction' for more
const test_points = {
  50: 0.20,
  40: 0.34,
  30: 0.57,
  20: 1.00,
  10: 1.85,
  5: 2.60,
  0: 3.80
};

class TestStore extends AbstractStore {
  constructor() {
    super();
    this.data = {};
    this.data["compressor.csv"] = stdheads.join(",");
  }
  read(what) { return Promise.resolve(this.data[what]); }
  write(what, data) {
    this.data[what] = data;
    return Promise.resolve();
  }
}

let Compressor;

describe("Compressor", () => {
  let comp;

  before(() => {
    return setup$(
      "../../..",
      "../html/fixed.html")
    .then(() =>
      // jquery-validation is a requirejs module, which will require
      // jquery, so it can't be imported this way when running from
      // node.js. It will work from the browser, though.
      (typeof process === "undefined")
      ? import("jquery-validation")
      : Promise.resolve())
    .then(() => import("../js/Compressor.js"))
    .then(mods => Compressor = mods.Compressor);
  });

  beforeEach(() => {
    const cfg = new Config(
      new TestStore(),
      // Set up test compressor config, using coefficients calculated
      // for test_points in mycurvefit.com
      {
        compressor: {
          fixed: {
            filter: {
              lifetime: 50,
              a: 3.798205,
              b: 1.149582,
              c: 11.50844,
              d: -0.4806983
            }
          }
        }
      }
      //, console.debug
    );
    comp = new Compressor();
    return comp.init({
      id: "fixed",
      config: $.extend(cfg, { id: "fixed" }),
      store: cfg.store
    });
  });

  it("initialises", () => {
    assert.equal(comp._remainingFilterLife(), 50);
    return comp._add({ operator: "Nuts", temperature: 20, humidity:50,runtime: 0 })
    .then(() => {
      assert.equal(comp.length(), 1);
      const e = comp.get(0);
      assert.equal(e.temperature, 20);
      assert.equal(e.humidity, 50);
      assert.equal(e.operator, "Nuts");
      assert.equal(e.runtime, 0);
      assert(!e.filters_changed);
    });
  });

  it("saves", () => {
    return comp._add({ operator: "Nuts", temperature: 20, runtime: 1 })
    .then(() => {
      return comp.save().then(() => {
        const s = $.csv.toArrays(comp.config.store.data["fixed_compressor.csv"]);
        assert.equal(s.length, 2);
      });
    })
    .then(() => {
      const s = $.csv.toArrays(comp.config.store.data["fixed_compressor.csv"]);
      assert.equal(s.length, 2);
      assert.deepEqual(s[0], stdheads);
      assert(Date.now() - new Date(s[1][0]).getTime() <= 1000,
             s);
      assert.deepEqual(s[1],
                       [s[1][0],"Nuts","20","","1","false"]);
    });
  });

  it("predicts filter life at 20C", () => {
    return comp._add({ temperature: 20, runtime: 0, filters_changed: true })
    .then(() => {
      // Add 50 hours at 20C, should take
      // the filter to (near) zero
      return comp._add({ temperature: 20, runtime:50 });
    })
    .then(() => {
      assert(Math.abs(comp._remainingFilterLife()) < 0.1,
             "FL "+comp._remainingFilterLife());
    });
  });

  it("predicts filter life at 40C", () => {
    // At 40C, multiplicative coefficient should be 0.34, so
    // lifetime should be 50 * 0.34 = 17 hours
    return comp._add({ temperature: 40, runtime:17 })
    .then(() => {
      assert(Math.abs(comp._remainingFilterLife()) < 1,
             "FL " + comp._remainingFilterLife());
    });
  });

  it("predicts filter life at 0C", () => {
    // At 0C, multiplicative coefficient is 3.8, so
    // lifetime should be 50 * 3.8 = 190 hours
    return comp._add({ temperature: 0, runtime:190 })
    .then(() => {
      assert(Math.abs(comp._remainingFilterLife()) < 0.1,
             "FL " + comp._remainingFilterLife());
    });
  });

  it("accumulates usage", () => {
    //comp.debug = console.debug;
    const Lp = 50; // manufacturer's estimate, filter life at 20C
    let Flp = Lp; // not run yet, so Flp is maximum
    let prom = Promise.resolve(), n = 1;
    for (let i in test_points) {
      // Run for an hour at each temperature.
      // This should degrade filter life at each step
      // Flp = Flp - 1 / (F*Lp)
      Flp -= 1 / (test_points[i] * 50);
      prom = prom.then(() => {
        comp._add({ temperature: i, runtime: n++ });
      });
    }
    return prom
    .then(() => {
      assert(Math.abs(comp._remainingFilterLife() - Flp) < 0.5,
             `${comp._remainingFilterLife()} <> ${Flp}`);
    });
  });

  it("ui", () => {
    //comp.debug=console.debug;
    return comp.loadUI()
    .then(() => comp.attachHandlers())
    .then(() => {
      let prom = Promise.resolve();
      let i = 1;
      $("button[name='add_record']").trigger("click");
      for (const T in test_points) {
        prom = prom
        .then(() => {
          comp.$tab.find("[name=temperature]").val(T);
          comp.$tab.find("[name=humidity]").val(50);
          comp.$tab.find("[name=runtime]").val(i);
          comp._addCompressorRecord();
          i += 0.25;
          return new Promise(resolve => setTimeout(resolve, 20)); 
        });
      }
      return prom;
    })
    .then(() => comp.reload_ui())
    .then(() => {
      assert.equal(comp.$tab.find(".cr_flr").text(), 46.76);
      assert.equal(comp.$tab.find(".cr_runtime").text(), 2.5);
    });
  });
});
