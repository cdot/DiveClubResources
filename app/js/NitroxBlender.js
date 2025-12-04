/*@preserve Copyright (C) 2021 Crawford Currie http://c-dot.co.uk license MIT*/
/* eslint-env browser,jquery */

import { Gas } from "./Gas.js";

/**
 * @typedef BankCylinder
 * @property {number} size - size of cylinder in litres
 * @property {number} price - cost of O2 from this cylinder in pounds
 * @property {number} bar - contents of this cylinder
 * @property {number} [mix=1] - mix (default 1 = pure O2)
 */

/**
 * Blend action callback. The first parameter is the name of
 * the action, the remaining parameters the arguments.
 * * `Bleed(target_cylinder_pressure, pressure_loss, waste)` -
 *    bleed cylinder to `target_cylinder_pressure`, losing
 *    `loss` litres of gas, and wasting `waste` litres
 *    of O2 over
 *    21%
 * * `AddFromBank(bank_name, target_cylinder_pressure,
 *                litres_used, bar_remaining_in_bank)` - add
 *  gas from `bank_name` to `target_cylinder_pressure`, using
 *  `litres_used` of gas from the bank and leaving `bar_remaining`
 *  bar in the bank
 * * `TopUp(target_cylinder_pressure)` - top up with air from
 *    compressor to `target_cylinder_pressure` bar
 * @callback Action
 * @param {string} action name - action name
 * @param {...*} args - arguments
 */

const AIR = 0.209; // fraction of O2 in air

/**
 * Support for optimal Nitrox blending from one or more bank
 * cylinders.  Takes into account the levels of O2 available from
 * the bank cylinders and plans a fill that uses the leftmost
 * cylinders first.
 * Equations in the doc use the following terms:
 * * T - temperature (Kelvin)
 * * Ms - start mix in cylinder, fraction of O2
 * * Ps - start pressure in cylinder (bar)
 * * Sc - size of cylinder (litres)
 * * Mf - bank mix - usually 1 = pure O2
 * * Pf - fill pressure (Pd = Ps + Pf + Pt)
 * * Pd - target pressure (bar)
 * * Ps - target mix, fraction of O2
 * * Mt - top-up mix, fracion of O2
 * * Pt - top-up pressure (Pd = Ps + Pf + Pt)
 */
class NitroxBlender {

  /**
   * Temperature used in real gas computations (K)
   */
  T = 0;

  /**
   * start pressure in cylinder
   * @member {number}
   */
  Ps = 0;

  /**
   * start mix in cylinder
   * @member {number}
   */
  Ms = 0;

  /**
   * cylinder size
   * @member {number}
   */
  Sc = 0;

  /**
   * target pressure
   * @member {number}
   */
  Pd = 0;

  /**
   * target mix
   * @member {number}
   */
  Md = 0;

  /**
   * mix of top-off gas (air = 0.209)
   * @member {number}
   */
  Mt = 0.209;

  /**
   * Min O2 price (used to calculate bleed cost)
   * @member {number}
   */
  O2_gbp = 0.001;

  /**
   * Bank cylinder
   * @member {BankCylinder}
   */
  bank = 0;

  /**
   * Action
   * @member {Action}
   */
  action = undefined;

  /**
   * Optional debug function (signature
   * as console.debug)
   * @member {function}
   */
  debug = () => {};

  /**
   * @param {object} p - parameters. Any of the fields can be
   * initialised.
   */
  constructor(p) {
    if (typeof p.T !== "undefined")
      this.T = Gas.C2K(p.T);
    if (typeof p.Ps !== "undefined")
      this.Ps = p.Ps;
    if (typeof p.Ms !== "undefined")
      this.Ms = p.Ms;
    if (typeof p.Sc !== "undefined")
      this.Sc = p.Sc;
    if (typeof p.Pd !== "undefined")
      this.Pd = p.Pd;
    if (typeof p.Md !== "undefined")
      this.Md = p.Md;
    if (typeof p.Mt !== "undefined")
      this.Mt = p.Mt;
    if (typeof p.O2 !== "undefined")
      this.O2_gbp = p.O2_gbp;
    if (p.bank)
      this.setBank(p.bank);
    this.action = p.action;
  }

  /**
   * Set the bank cylinder for mixing
   * @param {BankCylinder} bank
   */
  setBank(bank_cyl) {
    console.debug(`setBank: ${bank_cyl.name}`);
    if (typeof bank_cyl.mix === 'undefined')
      bank_cyl.mix = 1; // pure O2
    this.bank = bank_cyl;
  }

  /**
   * Pressure of gas required to get the cylinder to pre-top-off
   * state. We know that;
   * * Pd * Md = Ps * Ms + Pf * Mf + Pt * Mt [eqn 1]
   * * Given that Pt = Pd - Ps - Pf [eqn 2], rewrite as
   * * Pd * Md = Ps * Ms + Pf * Mf + (Pd - Ps - Pf) * Mt
   * * Pd * Md = Ps * Ms + Pf * Mf + Pd * Mt - Ps * Mt - Pf * Mt
   * * Pd * Md = Ps * Ms + Pf * Mf + Pd * Mt - Ps * Mt - Pf * Mt
   * * Pf * Mf - Pf * Mt = Pd * Md - Pd * Mt - Ps * Ms + Ps * Mt
   * * Pf * (Mf - Mt) = Pd * (Md - Mt) - Ps * (Ms - Mt)
   * * Pf = (Pd * (Md - Mt) - Ps * (Ms - Mt)) / (Mf - Mt) [eqn 3]
   * @return {number}
   */
  Pf() {
    return (this.Pd * (this.Md - this.Mt)
            - this.Ps * (this.Ms - this.Mt))
    / (this.bank.mix - this.Mt);
  }

  /**
   * Calculate best achievable Pf given this bank cylinder. This is
   * the maximum pressure that would be reached if we simply opened
   * the tap and let the cylinders reach pressure equilbrium.
   * @return {number} the best achievable Pf, in bar. If this is
   * negative, it means the equilibrium pressure is lower than
   * the pressure already in the cylinder.
   */
  bestPf() {
    // use real gas approximation to get the number of moles of
    // O2 and N2 respectively, then combine and get back the
    // real pressure of the mix in the total volume.
    const Sb = Gas.litres2m3(this.bank.size);
    const Sc = Gas.litres2m3(this.Sc);
    const bank_moles_O2 = Gas.real_moles(
      Gas.bar2Pa(this.bank.bar), Sb, this.T, "O");
    const cyl_moles_O2 = Gas.real_moles(
      Gas.bar2Pa(this.Ms * this.Ps), Sc, this.T, "O");
    const cyl_moles_N2 = Gas.real_moles(
      Gas.bar2Pa((1 - this.Ms) * this.Ps), Sc, this.T, "N");
    const ppO2 = Gas.real_pressure(
      bank_moles_O2 + cyl_moles_O2, Sb + Sc, this.T, "O");
    const ppN2 = Gas.real_pressure(cyl_moles_N2, Sb + Sc, this.T, "N");
    return Gas.Pa2bar(ppO2 + ppN2) - this.Ps;
  }

  /**
   * Can we add O2 usefully?
   */
  canAddFromBank() {
    console.debug("canAddFromBank:",
               `Ps is ${this.Ps}`,
               `ideal Pf is ${this.Pf().toFixed(2)}`,
               `(a Pi of ${(this.Ps + this.Pf()).toFixed(2)})`);
    if (this.Pf() <= 0) {
      console.debug(`\tenough or too much O2 in cylinder`);
      return false;
    }
    if (this.bestPf() > 0) {
      console.debug(
        `\tThe ${this.bank.size}L bank has ${this.bank.bar} bar`,
        `so can provide Pf up to ${this.bestPf().toFixed(2)} bar`,
        `(a Pi of ${(this.Ps + this.bestPf()).toFixed(2)})`);
      return true;
    }
    console.debug(`\tThe ${this.bank.size}L bank has ${this.bank.bar} bar`);
    console.debug(`\tEquilibrium pressure is ${-this.bestPf().toFixed(2)} bar lower than cylinder pressure ${this.Ps}`);
    return false;
  }

  /**
   * Can we bleed down to an easier starting point?
   */
  canBleed() {
    return this.Ps > 1;
  }

  /**
   * Bleed down as far as we need to to achieve the Md with this bank.
   */
  bleedDown() {
    console.debug(`bleed down:`);
    const startPs = this.Ps;
    console.debug(`\tstart Ps ${startPs}`);
    if (this.Ps >= this.bank.bar) {
      // Too much pressure in the cylinder.
      // Bleed down below the bank pressure.
      this.Ps = this.bank.bar;
      console.debug(`\ttoo much pressure, bleed below ${this.Ps}`);
      console.debug(`\tPf now ${this.Pf()}`);
    }

    if (this.Pf() <= 0) {
      // Still too much O2 in the cylinder. Pf has to be 0, so
      // solve for Ps.
      // Pd * Md = Ps * Ms + Pt * Mt
      // Pt = Pd - Ps, so
      // Pd * Md = Ps * Ms + (Pd - Ps) * Mt
      // Pd * Md = Ps * Ms + Pd * Mt - Ps * Mt
      // Pd * Md - Pd * Mt = Ps * Ms - Ps * Mt
      // Pd * (Md - Mt) = Ps * (Ms - Mt)
      // Ps = Pd * (Md - Mt) / (Ms - Mt)
      this.Ps = this.Pd * (this.Md - this.Mt) / (this.Ms - this.Mt);
      console.debug(`\ttoo much O2, bleed to ${this.Ps}`);
    }

    if (this.Ps + this.Pf() > this.bank.bar) {    
      // We know that 
      // Pd * Md = Ps * Ms + Pf * Mf + Pt * Mt
      // We need to solve             
      // Pf = (Pd * (Md - Mt) - Ps * (Ms - Mt)) / (Mf - Mt)
      // We also know that equilibrium is reached when:
      // Pf = (Pbs - Ps) / (Sc / Sb + 1)
      // (where Pbs = gas pressure in bank)
      // so
      // (Pd * (Md - Mt) - Ps * (Ms - Mt)) / (Mf-Mt) =
      //      (Pbs - Ps) / (Sc / Sb + 1)
      // Pd * (Md - Mt) - Ps * (Ms - Mt) = 
      //     (Mf-Mt) * Pbs / (Sc / Sb + 1) - (Mf-Mt) * Ps /
      //                                     (Sc / Sb + 1)
      // Pd * (Md - Mt) - (Mf-Mt) * Pbs / (Sc / Sb + 1) = 
      //      Ps * (Ms - Mt) - (Mf-Mt) * Ps / (Sc / Sb + 1)
      // Pd * (Md - Mt) - (Mf-Mt) * Pbs / (Sc / Sb + 1) = 
      //      Ps * ((Ms - Mt) - (Mf-Mt) / (Sc / Sb + 1))
      // Ps = (Pd * (Md - Mt) - (Mf-Mt) * Pbs / (Sc / Sb + 1)) / 
      //      ((Ms - Mt) - (Mf-Mt) / (Sc / Sb + 1))
      this.Ps = 
      (this.Pd * (this.Md - this.Mt) - this.bank.bar
       * (this.bank.mix - this.Mt)
       / (this.Sc / this.bank.size + 1)) /
      ((this.Ms - this.Mt) - (this.bank.mix - this.Mt) /
       (this.Sc / this.bank.size + 1));
      if (this.Ps < 1) this.Ps = 1;
      console.debug(`\tdrop below bank to ${this.Ps} bar`);
    }
    const drained_l = this.Sc * (startPs - this.Ps);
    const wasted_l = drained_l * (this.Ms - AIR);
    console.debug(`\tBleed will waste ${wasted_l}L of O2 worth ${wasted_l * this.O2_gbp}`);
    this.action({
      action: "Bleed",
      to_bar: this.Ps, // target pressure
      drained_l: drained_l, // total litres drained
      drained_bar: drained_l / this.Sc, // total bar drained
      wasted_l: wasted_l // litres of O2 wasted
    });
    console.debug(`\tAfter bleeding cylinder is now ${this.Ps} bar`,
               `\n\t${wasted_l} of O2 wasted`);
  }

  /**
   * Add whatever O2 we can from the current bank to try to
   * meet requirements.
   */
  addO2() {
    const Pf = Math.min(this.Pf(), this.bestPf());
    if (Pf <= 0)
      return;
    const litres_used = Pf * this.Sc;
    console.debug(`addO2: Pf ${Pf.toFixed(2)} bar, ${litres_used.toFixed(2)}L`);
    const leftInBank = (this.bank.size * this.bank.bar - litres_used)
          / this.bank.size;
    this.action({
      action: "AddFromBank",
      bank: this.bank.name,
      to_bar: this.Ps + Pf, // target pressure
      used_l: litres_used,
      // pressure left in the bank
      left_bar: leftInBank,
      cost_gbp: litres_used * this.bank.price
    });
    this.Ms = (this.Ps * this.Ms + Pf) / (this.Ps + Pf);
    this.Ps += Pf;
    console.debug(`\tAfter adding O2 bank has ${leftInBank.toFixed(2)} bar left`,
               `\n\t\tcylinder is now ${this.Ps.toFixed(2)} bar`,
               `\n\t\tintermediate Ms = ${(this.Ms * 100).toFixed(2)}%`,
               `\n\t\tcost £${(litres_used * this.bank.price).toFixed(2)}`);
  }

  haveEnoughO2() {
    return this.Pf() < 1;
  }

  /**
   * Top up with air. This is not strictly needed as an action,
   * because it is always needed to complete the blend.
   */
  topUp() {
    const Pt = this.Pd - this.Ps;
    this.action({
      action: "TopUp",
      to_bar: this.Pd,
      used_l: Pt * this.Sc
    });
    const mix = (this.Ps * this.Ms + Pt * this.Mt) / this.Pd;
    console.debug(`topUp: ${Pt.toFixed(2)} bar of air,`,
               `which will result in a ${(mix * 100).toFixed(2)}% mix`);
    this.Ps += Pt;
  }

  /**
   * Given an array of bank cylinders, find the filling sequence.
   * The action function will be called with a series of actions
   * @param {BankCylinder[]} banks - sorted array of bank
   * cylinders to get gas from
   * @param {number} [startBank=0] - first bank to consider for filling
   * @return {boolean} if the fill is achievable starting at this bank
   */
  blend(banks, startBank) {
    if (banks.length === 0)
      throw new Error("No banks to add O2 from");
    if (typeof startBank !== 'number')
      startBank = 0;
    if (startBank >= banks.length)
      throw new Error("Invalid start bank");
      
    if (this.Ms <= 0.21) this.Ms = AIR;
    console.debug("blend: target is", this.Pd, "bar of",
               `${this.Md * 100}% in a`,
               `${this.Sc}L cylinder`);
    console.debug(
      `\tCylinder already has ${this.Ps.toFixed(2)} bar`,
      `of ${this.Ms * 100}%,`,
      `so contains ${(this.Ps * this.Ms).toFixed(2)} bar of O2`);

    if (this.Ms > AIR)
      console.debug(
        "\tThis is", (this.Ps * (this.Ms - AIR) * this.Sc).toFixed(2),
        "litres over air");

    let bled = false;
    for (let banki = startBank; banki < banks.length; banki++) {
      if (banks[banki] !== this.bank)
        this.setBank(banks[banki]);
      if (this.canAddFromBank()) {
        // We can usefully add O2 from this bank
        if (!this.haveEnoughO2())
          this.addO2();
      }
      else if (!bled && this.canBleed() && this.bank.bar > 1) {
        this.bleedDown();
        bled = true;
        banki--; // repeat this bank
      }
      if (this.haveEnoughO2()) {
        this.topUp();
        return true;
      }
    }
    this.action({
      action: "Impossible"
    });
    
    return false;
  }

  /**
   * Given a set of banks, calculate the fill solution that is
   * lowest cost in terms of extra O2 lost from bleeding down,
   * versus gas added from the bank. The goal is to encourage
   * use of the lowest pressure cylinders first, and only use
   * higher pressure cylinders to top up.
   * @param {BankCylinder[]} banks - sorted array of bank cylinders
   * @return {object} a summary of the best found `{ cheapest:, fastest: }
   * where each entry has 
   * `{ bank: start bank, cost:, time: }`
   */
  bestBlends(banks) {
    let drained_l = 0,
        wasted_l = 0,
        used_l = 0;
    let actions = [];
    function action(a) {
      actions.push(a);
      switch (a.action) {
      case "Bleed":
        drained_l += a.drained_l;
        wasted_l += a.wasted_l;
        break;
      case "AddFromBank":
        used_l += a.used_l;
        break;
      }
    }
    const params = {
      T: this.T,
      Sc:  this.Sc,
      Ms: this.Ms, Ps: this.Ps,
      Md: this.Md, Pd: this.Pd,
      O2_gbp: this.O2_gbp,
      action: action
    };
    console.debug("Finding best blend");
    const res = {};
    for (let startBank = 0; startBank < banks.length; startBank++) {
      const bank = banks[startBank];
      console.debug(`-- Starting with bank ${bank.name}`);
      if (bank.bar <= 1) {
        console.debug("\tbank is empty");
        continue;
      } else {
        console.debug(`\tbank has ${bank.bar} bar`);
      }
      drained_l = 0;
      wasted_l = 0;
      used_l = 0;
      actions = [];
      const b = new NitroxBlender(params);
      if (b.blend(banks, startBank)) {
        const fill = {
          bank: startBank,
          pay_gbp: used_l * bank.price,
          wasted_gbp: wasted_l * this.O2_gbp,
          // Max fill rate 5 bar per minute. 
          // 100 litres per minute drain down rate
          time: (used_l / this.Sc) / 5 + drained_l / 100,
          actions: actions
        };
        if (fill.pay_gbp > 0)
          actions.push({
            action: "Pay",
            cost_gbp: fill.pay_gbp
          });
        if (typeof res.cheapest === 'undefined'
            || fill.wasted_gbp + fill.pay_gbp
            < res.cheapest.wasted_gbp + res.cheapest.pay_gbp) {
          console.debug(`\tcheapest bank ${bank.name}`);
          res.cheapest = fill;
        }
        if (typeof res.fastest === 'undefined'
            || fill.time < res.fastest.time) {
          console.debug(`\tfastest bank ${bank.name}`);
          res.fastest = fill;
        }
      }
    }

    return res;
  }
}

export { NitroxBlender }
