use ui::{CriticallyDampedSpring, InertialDecay, Motion, MotionCurve, rubber_band};

#[test]
fn closed_form_motion_and_spring_are_fps_invariant_and_continuous_on_interruption() {
    let curves = [
        (MotionCurve::Linear, 300.0),
        (MotionCurve::EaseOutQuad, 320.0),
        (MotionCurve::EaseInOutCubic, 300.0),
        (MotionCurve::EaseOutQuint, 300.0),
        (MotionCurve::SWIPE_MENU, 230.0),
        (MotionCurve::SWIPE_DIALOG, 320.0),
        (MotionCurve::SWIPE_DIALOG_RUNTIME_OUT_QUAD, 320.0),
    ];

    for (curve, duration_ms) in curves {
        let motion = Motion::new(0.0, 240.0, curve, 100.0, duration_ms);
        let end_ms = 100.0 + duration_ms;
        let reference_end = motion.value_at(end_ms);
        assert_eq!(reference_end.to_bits(), 240.0_f64.to_bits());
        assert_eq!(motion.value_at(100.0).to_bits(), 0.0_f64.to_bits());
        assert!(motion.is_finished(end_ms));

        for fps in [60_u32, 120, 24, 7] {
            let dt = 1000.0 / f64::from(fps);
            let mut t = 100.0;
            let mut last = motion.value_at(t);
            while t < end_ms {
                t = (t + dt).min(end_ms);
                let next = motion.value_at(t);
                assert!(next >= last - 1e-9);
                last = next;
            }
            assert_eq!(last.to_bits(), reference_end.to_bits());
        }
    }

    // InertialDecay byte-identical terminal state across 60 / 120 / 24 / 7 fps.
    let decay = InertialDecay::new(50.0, 1200.0, 3.25, 0.0);
    let decay_end_ms = decay.stop_duration_ms();
    let decay_ref = decay.value_at(decay_end_ms);
    assert!(decay_ref > 50.0);
    for fps in [60_u32, 120, 24, 7] {
        let dt = 1000.0 / f64::from(fps);
        let mut t = 0.0;
        while t < decay_end_ms {
            t = (t + dt).min(decay_end_ms);
        }
        assert_eq!(decay.value_at(t).to_bits(), decay_ref.to_bits());
        assert_eq!(decay.velocity_at(t).to_bits(), 0.0_f64.to_bits());
    }

    // Rubber-band monotonicity and symmetry.
    assert_eq!(rubber_band(0.0, 400.0, 0.55), 0.0);
    assert!((rubber_band(100.0, 400.0, 0.55) + rubber_band(-100.0, 400.0, 0.55)).abs() < 1e-12);
    assert!(rubber_band(100.0, 400.0, 0.55) < 100.0);

    // CriticallyDampedSpring mid-flight reverse interruption preserves position & velocity
    // continuity and reaches byte-identical terminal state across 60 / 120 / 24 / 7 fps.
    let spring = CriticallyDampedSpring::new(0.0, 0.0, 300.0, 18.0, 0.0);
    let interrupt_ms = 90.0;
    let pos_before = spring.value_at(interrupt_ms);
    let vel_before = spring.velocity_at(interrupt_ms);
    assert!(pos_before > 0.0 && pos_before < 300.0);
    assert!(vel_before > 0.0);

    let reversed = spring.retarget(interrupt_ms, 0.0);
    assert_eq!(
        reversed.value_at(interrupt_ms).to_bits(),
        pos_before.to_bits()
    );
    assert_eq!(
        reversed.velocity_at(interrupt_ms).to_bits(),
        vel_before.to_bits()
    );

    let settle_ms = interrupt_ms + reversed.settle_duration_ms;
    for fps in [60_u32, 120, 24, 7] {
        let dt = 1000.0 / f64::from(fps);
        let mut t = interrupt_ms;
        while t < settle_ms {
            t = (t + dt).min(settle_ms);
        }
        assert_eq!(reversed.value_at(t).to_bits(), 0.0_f64.to_bits());
        assert!(reversed.is_finished(t));
    }
}
