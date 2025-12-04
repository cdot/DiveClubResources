/*eslint-env node, mocha */

import { assert } from "chai";
import { Gas } from "../js/Gas.js";
import { NitroxBlender } from "../js/NitroxBlender.js";

const tests = [
  {
		name: "enough in the bank",
    T: Gas.C2K(4),
    Sc: 12,
    Ms: 0.26,  Ps: 30,
    Md: 0.32, Pd: 232,
		banks: [
			{ name: "bank", price: 0.01, size: 49, bar: 90 } ],
    expect: [
			{
        action: "AddFromBank",
        bank: "bank",
        to_bar: 60.62,
        used_l: 367.46,
        left_bar: 82.50,
        cost_gbp: 3.67
      },
			{
        action: "TopUp",
        to_bar: 232,
        used_l: 2056.54
      }
		]
	},
  {
		name: "second bank needed",
    T: Gas.C2K(25),
    Sc:  7,
    Ms: 0.21,  Ps: 20,
    Md: 0.32, Pd: 232,
		banks: [
			{ name: "A", price: 0.005, size: 49, bar: 30 },
			{ name: "B", price: 0.01, size: 52, bar: 100 },
		],
    expect: [
			{
        action: "AddFromBank",
        bank: "A",
        to_bar: 28.74,
        used_l: 61.16,
        left_bar: 28.75,
        cost_gbp: 0.31
      },
			{
        action: "AddFromBank",
        bank: "B",
        cost_gbp: 1.67,
        to_bar: 52.56,
        used_l: 166.73,
        left_bar: 96.79
      },
			{
        action: "TopUp",
        to_bar: 232,
        used_l: 1256.11
      }
		],
	},

  {
		name: "all banks needed",
    T: Gas.C2K(14),
    Sc:  15,
    Ms: 0.21,  Ps: 50,
    Md: 0.5, Pd: 232,
		banks: [
			{ name: "A", price: 0.005, size: 49, bar: 30 },
			{ name: "B", price: 0.01, size: 52, bar: 40 },
			{ name: "C", price: 0.01, size: 52, bar: 50 },
			{ name: "D", price: 0.01, size: 52, bar: 200 },
		],
    expect: [
			{
        action: "Bleed",
        to_bar: 1,
        drained_bar: 49,
        drained_l: (50 - 1) * 15,
        wasted_l: 0
      },
			{
        action: "AddFromBank",
        bank: "A",
        cost_gbp: 1.66,
        to_bar: 23.19,
        used_l: 332.87,
        left_bar: 23.21
      },
			{
        action: "AddFromBank",
        bank: "B",
        cost_gbp: 1.96,
        to_bar: 36.23,
        used_l: 195.6,
        left_bar: 36.24
      },
			{
        action: "AddFromBank",
        bank: "C",
        cost_gbp: 1.6,
        to_bar: 46.91,
        used_l: 160.22,
        left_bar: 46.92
      },
			{
        action: "AddFromBank",
        bank: "D",
        cost_gbp: 5.92,
        to_bar: 86.35,
        used_l: 591.55,
        left_bar: 188.62
      },
			{
        action: "TopUp",
        to_bar: 232,
        used_l: 2184.75
      }
		],
	},

  // Too much O2 already in cylinder, need to bleed
  {
		name: "too much O2",
    T: Gas.C2K(40),
    Sc: 10,
    Ms: 0.32, Ps: 200,
    Md: 0.28, Pd: 230,
    banks: [
			{ name: "bank", price: 0.015, size: 47,  bar: 210 }
		],
    expect: [
			{
        action: "Bleed",
        to_bar: 147.12,
        drained_bar: 52.88,
        drained_l: 528.83,
        wasted_l: 58.7
      },
			{
        action: "TopUp",
        to_bar: 230,
        used_l: 828.83
      }
		]
	},

  // Mix achievable, but too much pressure already in cylinder,
	// need to empty it first
  {
		name: "too much pressure",
    T: Gas.C2K(18),
    Sc: 3,
    Ms: 0.21, Ps: 40,
    Md: 0.30, Pd: 230,
    banks: [
			{ name: "bank", price: 0.025, size: 40,  bar: 30 }
		],
    expect: [
			{
        action: "Bleed",
        to_bar: 1.56,
        drained_l: 115.33,
        drained_bar: 38.44,
        wasted_l: 0
      },
			{
        action: "AddFromBank",
        bank: "bank",
        cost_gbp: 1.98,
        to_bar: 28.01,
        used_l: 79.37,
        left_bar: 28.02
      },
			{
        action: "TopUp",
        to_bar: 230,
        used_l: 605.97
      },
		]
	},

  {
		name: "strong mix, all banks needed",
    T: Gas.C2K(14),
    Sc:  15,
    Ms: 0.50,  Ps: 100,
    Md: 0.5, Pd: 232,
		banks: [
			{ name: "A", price: 0.005, size: 49, bar: 30 },
			{ name: "B", price: 0.01, size: 52, bar: 40 },
			{ name: "C", price: 0.01, size: 52, bar: 50 },
			{ name: "D", price: 0.01, size: 52, bar: 200 },
		],
    expect: [
			{
        action: "Bleed",
        to_bar: 1,
        drained_bar: 99,
        drained_l: (100 - 1) * 15,
        wasted_l: 432.14
      },
			{
        action: "AddFromBank",
        bank: "A",
        cost_gbp: 1.66,
        to_bar: 23.19,
        used_l: 332.88,
        left_bar: 23.21
      },
			{
        action: "AddFromBank",
        bank: "B",
        cost_gbp: 1.96,
        to_bar: 36.23,
        used_l: 195.6,
        left_bar: 36.24
      },
			{
        action: "AddFromBank",
        bank: "C",
        cost_gbp: 1.6,
        to_bar: 46.91,
        used_l: 160.22,
        left_bar: 46.92
      },
			{
        action: "AddFromBank",
        bank: "D",
        cost_gbp: 5.86,
        to_bar: 85.98,
        used_l: 586.03,
        left_bar: 188.73
      },
			{
        action: "TopUp",
        to_bar: 232,
        used_l: 2190.27
      }
		],
	}
];

function rounded(obj) {
  if (Array.isArray(obj)) {
    return obj.map(v => rounded(v));
  } else if (typeof obj === "object") {
    const res = {};
    for (const k of Object.keys(obj))
      res[k] = rounded(obj[k]);
    return res;
  } else if (typeof obj === "number")
    return Math.round(obj * 100) / 100;
  return obj;
}

describe("NitroxBlender", () => {
  for (let test of tests) {
    it(test.name, function() {
		  const actions = [];
		  test.action = function(act) {
			  if (typeof act === "object" && act.action) {
          act = rounded(act);
          actions.push(act);
        }
		  };
		  const filler = new NitroxBlender(test);
      assert(filler.blend(test.banks, 0));
		  assert.deepEqual(actions, test.expect);
    });
  }

	it("40 to 50 in a 7L stage", () => {
		const banks = [
			{ name: "A", price: 0.005, size: 49, bar: 1 },
			{ name: "B", price: 0.01, size: 52, bar: 1 },
			{ name: "C", price: 0.015, size: 52, bar: 180 },
			{ name: "D", price: 0.025, size: 52, bar: 200 },
		];

		const params = {
			T: Gas.C2K(20),
			Sc:  7,
			Ms: 0.40,  Ps: 160,
			Md: 0.5, Pd: 232
		};
		let filler = new NitroxBlender(params);
		const blends = rounded(filler.bestBlends(banks));
  });

  it("cheapest/fastest blend", () => {
	  const banks = [
		  { name: "A", price: 0.005, size: 49, bar: 30 },
		  { name: "B", price: 0.01, size: 52, bar: 40 },
		  { name: "C", price: 0.015, size: 52, bar: 150 },
		  { name: "D", price: 0.025, size: 52, bar: 200 },
	  ];

	  const params = {
		  T: Gas.C2K(14),
		  Sc:  15,
		  Ms: 0.50,  Ps: 100,
		  Md: 0.5, Pd: 232
	  };
	  let filler = new NitroxBlender(params);
	  const blends = rounded(filler.bestBlends(banks));
    
	  assert.deepEqual(blends, {
		  cheapest: {
			  bank: 0,
        pay_gbp: 6.37,
        time: 31.85,
        wasted_gbp: 0.43,
			  actions: [
				  {
            action: "Bleed",
            to_bar: 1,
            drained_l: (100-1)*15,
            wasted_l: 432.14,
            drained_bar: 99
          },
				  {
            action: "AddFromBank",
            bank: "A",
            cost_gbp: 1.66,
            to_bar: 23.17,
            used_l: 332.62,
            left_bar: 23.21
          },
				  {
            action: "AddFromBank",
            bank: "B",
            cost_gbp: 1.96,
            to_bar: 36.22,
            used_l: 195.73,
            left_bar: 36.24
          },
				  {
            action: "AddFromBank",
            bank: "C",
            cost_gbp: 11.2,
            to_bar: 85.98,
            used_l: 746.39,
            left_bar: 135.65
          },
				  {
            action: "TopUp",
            to_bar: 232,
            used_l: 2190.27
          },
          {
            action: "Pay",
            cost_gbp: 6.37
          }
			  ]},
		  fastest: {
			  bank: 3,
        pay_gbp: 18.21,
        time: 9.71,
        wasted_gbp: 0,
			  actions: [
				  {
            action: "AddFromBank",
            bank: "D",
            cost_gbp: 18.21,
            to_bar: 148.56,
            used_l: 728.42,
            left_bar: 185.99
          },
				  {
            action: "TopUp",
            to_bar: 232,
            used_l: 1251.58
          },
          {
            action: "Pay",
            cost_gbp: 18.21
          }
			  ]}
	  });
  });
});
