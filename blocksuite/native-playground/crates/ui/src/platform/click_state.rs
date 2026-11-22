use crate::{Pixels, Point};

#[derive(Default)]
pub(crate) struct ClickState {
    last_position: Point<Pixels>,
    last_time: f64,
    pub(super) current_count: usize,
}

impl ClickState {
    fn distance(&self, p: Point<Pixels>) -> f32 {
        f32::from(p.x - self.last_position.x).hypot(f32::from(p.y - self.last_position.y))
    }
    fn reset(&mut self) {
        self.current_count = 0;
        self.last_time = 0.0;
    }
    pub(crate) fn drag_to(&mut self, position: Point<Pixels>) {
        if self.distance(position) >= 5.0 {
            self.reset();
        }
    }
    pub(crate) fn register_click(&mut self, position: Point<Pixels>, time: f64) -> usize {
        if time - self.last_time < 400.0 && self.distance(position) < 5.0 {
            self.current_count += 1;
        } else {
            self.current_count = 1;
        }
        self.last_position = position;
        self.last_time = time;
        self.current_count
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{point, px};

    #[test]
    fn drag_breaks_the_click_sequence() {
        let a = point(px(25.), px(30.));
        for (dx, dy, clicks) in [(0., 0., 2), (3., 4., 1)] {
            let mut state = ClickState::default();
            assert_eq!(state.register_click(a, 100.), 1);
            state.drag_to(point(a.x + px(dx), a.y + px(dy)));
            assert_eq!(state.register_click(a, 250.), clicks);
        }
    }
}
