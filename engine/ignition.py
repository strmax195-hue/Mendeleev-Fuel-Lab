"""Shared four-stroke geometry and ignition-delay integration, using SI units."""

from dataclasses import dataclass
import math


@dataclass(frozen=True)
class Engine:
    name: str
    ref: str
    cr: float
    litres: float
    stroke: float
    gauge_bar: float
    flow_mg_ms: float  # reference effective flow at fixed injector pressure drop
    dead_ms: float
    injection_window: float  # usable crank degrees per four-stroke cycle
    peak_limit_bar: float

    @property
    def diesel(self):
        return self.ref == "diesel"


ENGINES = {
    "mpi": Engine("Naturally aspirated MPI", "ai95", 10.5, 2.0, 0.086, 0, 3.6, 0.70, 540, 120),
    "gdi": Engine("Downsized GDI turbo", "ai95", 10.0, 1.4, 0.080, 1.8, 13.0, 0.30, 270, 155),
    "diesel": Engine("Common-rail diesel", "diesel", 16.5, 2.0, 0.090, 0.8, 35.0, 0.22, 60, 190),
}


def relative_volume(cr, theta):
    """Cylinder volume divided by swept volume for a 3.5 rod/crank-radius ratio."""
    r = math.radians(theta)
    return 1 / (cr - 1) + (1 - math.cos(r) + 3.5 - math.sqrt(3.5**2 - math.sin(r) ** 2)) / 2


def ci_delay(temperature, pressure_pa, cn, rpm, stroke):
    """Hardenberg–Hase pressure-rise delay converted from crank degrees to seconds."""
    bar = pressure_pa / 1e5
    if min(temperature, pressure_pa, cn, rpm, stroke) <= 0:
        raise ValueError("Positive diesel ignition inputs required")
    if bar <= 12.4:
        return math.inf
    activation = 618840 / (cn + 25)
    log_factor = (
        activation * (1 / (8.31446 * temperature) - 1 / 17190) + (21.2 / (bar - 12.4)) ** 0.63
    )
    if log_factor > 700:
        return math.inf
    piston_speed = 2 * stroke * rpm / 60
    return (0.36 + 0.22 * piston_speed) * math.exp(log_factor) / (6 * rpm)


def livengood_wu(samples, rpm):
    """Trapezoidal integral of dt/tau; locate unity under a linearly varying rate."""
    if rpm <= 0:
        raise ValueError("Positive crank speed required")
    integral, onset, previous = 0.0, None, None
    for theta, tau in samples:
        if not math.isfinite(theta) or not tau > 0:
            raise ValueError("Invalid ignition delay sample")
        rate = 1 / tau
        if previous is not None:
            angle, old_rate = previous
            span = theta - angle
            if span <= 0:
                raise ValueError("Crank angles must increase")
            dt = span / (6 * rpm)
            gain = dt * (old_rate + rate) / 2
            if onset is None and integral + gain >= 1:
                target = (1 - integral) / dt
                # Stable root of old_rate*f + (rate-old_rate)*f²/2 = target.
                f = (
                    2
                    * target
                    / (old_rate + math.sqrt(max(0, old_rate**2 + 2 * (rate - old_rate) * target)))
                )
                onset = angle + span * f
            integral += gain
        previous = theta, rate
    return integral, onset
