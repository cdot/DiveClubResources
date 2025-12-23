# Compressor
![Compressor page](images/Compressor.png)

Compressor support includes a logging application and an optional sensor
package.

## Sensors
At HSAC the sensors are interfaced through an ancient [Raspberry Pi](https://www.raspberrypi.org/)
that reads [DS18B20](https://datasheets.maximintegrated.com/en/ds/DS18B20.pdf) temperature, [DHT11](https://www.makerguides.com/wp-content/uploads/2019/02/DHT11-Datasheet.pdf) humidity and temperature, and power [PC817](https://octopart.com/datasheet/pc817b-sharp-9239011) sensors.
The Raspberry Pi runs the server to poll the sensors, and makes the
results available to the app via AJAX requests. The URL to make these
requests is called the **Sensors root URL** and is specified in the
configuration dialog of the app. Sensors are polled every few
seconds. An audible alarm can be triggered if the internal temperature
sensor in the compressor exceeds a given limit.

Note that we have found the DHT11 humidity sensor to be particularly
unreliable, so we use manually entered values most of the time. Some
day we should really replace it with something better (e.g. an AHT20).

The Pi is also used as the database server - see [DATABASES](DATABASES.md).

## Filter Life Prediction

Compressor manufacturers usually publish guidelines for the expected
lifetime of the filters in their compressors. These normally include a
<b>Predicted Filter Lifetime</b> *Lp* for the filter (in hours) when
the compressor is run at a typical temperature
(e.g. 20&deg;C). Compressor filter performance degrades significantly
at higher temperatures and generally improves slightly at lower
temperatures, so manufacturers usually publish a curve indicating
expected filter lifetime at different temperatures. This is normally
an exponential curve that we have found, in the case of our Coltri
MCH/16, can be modelled fairly accurately using a symmetric sigmoidal
curve

![equation](http://www.algebra.com/cgi-bin/plot-formula.mpl?expression=F%3DD%2B(A-D)%2F(1%2B(T%2FC)%5EB))

where *T* is the temperature, *F* is a lifetime degradation factor,
and *A*, *B*, *C* and *D* are constants.

We can apply this degradation factor *F* to the manufacturer's
predicted lifetime *Lp* to obtain a predicted lifetime at any
temperature. For a runtime of *dT* hours, we can derive a remaining filter life
prediction *Flp*

![equation](http://www.algebra.com/cgi-bin/plot-formula.mpl?expression=Flp%3DLp-dT%2F(F*Lp))

This calculation is updated automatically at the end of each compressor
run, providing a continuous estimate of filter life remaining.

The default filter lifetime constants for the static compressor
prediction are derived from data provided by Coltri for an MCH 16/ET,
and for the portable compressor by Bauer for a PE100, though you can
provide your own coefficients to match your compressor/filters in the
configuration dialog (http://www.mycurvefit.com provides a convenient way
to fit a symmetric sigmoidal curve to a set of data points)

## Operational Limits

The application automatically evaluates values of temperature and
humidity to determine whether it is safe to operate the compressor.

The lifetime of filters is mostly determined by the amount of water
that has to be removed from the air, which is in turn dictated by the
relative humidity. In an effort to maximise filter
life, the app tracks the operating temperature and humidity.

Going back to basics, the [saturation partial pressure of water vapour](https://en.wikipedia.org/wiki/Tetens_equation) is proportional to temperature:

![equation](http://www.algebra.com/cgi-bin/plot-formula.mpl?expression=Sp%3D610.78*e%5E(17.2*(T%2F(T%2B237.3))))

where *T* is the air temperature in &deg;C, and *Sp* is in Pascals. This
can be converted to a water vapour capacity in gm<sup>-3</sup>

![equation](http://www.algebra.com/cgi-bin/plot-formula.mpl?expression=Cw%3D2.166*(Sp%2F(T%20%2B%20273.16)))

Using these equations, air at 20&deg;C will have a water vapour capacity
of around 17gm<sup>-3</sup> at 1 bar. Since

Relative Humidity (RH) = (Water vapour content) / (Water vapour capacity)

we can calculate that at 20&deg;C, 80% humidity, the air contains 13.6gm<sup>-3</sup>. At 50% humidity, 8.5gm<sup>-3</sup>.

Let's say it's 80%RH and 20&deg;C. You are pumping a 10L cylinder to
232 bar, that is 2320 litres (2.32m<sup>3</sup>) of air at 1 bar,
which will contain 31.55g of water vapour. Since the dryness
requirement (for Nitrox) is 0.02gm<sup>-3</sup>,
there can be no more than 0.046g of water in the filled
tank. So we have to remove 31.5g of water.

The reason the amount of water removed is important is that the
performance of the filtration system depends on it. You have to purge
the extracted water (condensate) from the system regularly, otherwise
it pools at the base of the filter tower and saturates the media,
shortening the filter life. But every time you purge you lose
pressure, which increases the fill time, and also increases the amount
of air input to the system. We have to find a "sweet spot" where the
fill time is minimised, but the filter life is maximised. We do this
by setting a threshold for the volume of condensate that can be
generated in a single purge cycle.

The threshold is a function of:
1. The **Maximum condensate** volume (in ml) which is acceptable between purges
2. The **Pumping rate** of the compressor (in litres per minute)
3. The **Purging frequency**, in minutes
4. The temperature and humidity (and atmospheric pressure, though the effect
of this is negligible)

The parameters controlling this calculation can be set up in the
configuration dialog. Temperature and humidity are either read from sensors
or manually entered. Experience has shown that our compressor can tolerate a
build up of up to 35ml of condensate before a purge becomes necessary. Purging
every 7 minutes means we can fill at up to 90% humidity, below 20&deg;C.

For more information on how the calculation is performed see the source code.
