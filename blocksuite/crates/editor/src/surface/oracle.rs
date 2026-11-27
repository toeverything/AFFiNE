use super::*;
use blocksuite_playground_doc::read::{RichText, SurfaceElement, SurfaceElementKind};
use serde_json::{Value, json};
fn oracle() -> Value {
    serde_json::from_str(include_str!("../../../oracle/surface-oracle.json")).unwrap()
}
fn val(p: P) -> Value {
    json!([p.0, p.1])
}
fn close(actual: &Value, expected: &Value, path: &str) {
    match (actual, expected) {
        (Value::Array(a), Value::Array(b)) => {
            assert_eq!(a.len(), b.len(), "{path}");
            for (i, (a, b)) in a.iter().zip(b).enumerate() {
                close(a, b, &format!("{path}/{i}"));
            }
        }
        (Value::Number(a), Value::Number(b)) => assert!(
            (a.as_f64().unwrap() - b.as_f64().unwrap()).abs() < 1e-6,
            "{path}: {a} vs {b}"
        ),
        _ => assert_eq!(actual, expected, "{path}"),
    }
}
fn ops(contours: &[Contour]) -> Value {
    let mut ops = vec![];
    for c in contours {
        ops.push(json!(["move", [c.start.0, c.start.1]]));
        for e in &c.edges {
            match e {
                Edge::Cubic(a, b, z) => {
                    ops.push(json!(["bcurveTo", [a.0, a.1, b.0, b.1, z.0, z.1]]))
                }
                _ => panic!("unexpected rough operation"),
            }
        }
    }
    json!(ops)
}
#[test]
fn scribbled_shapes_match_roughjs_operations() {
    for c in oracle()["scribbles"].as_array().unwrap() {
        let s = SurfaceElement::from_properties(
            "s".into(),
            json!({"type":"shape","shapeType":c["shape"],"xywh":c["bounds"],"radius":c["radius"],"roughness":c["roughness"],"strokeWidth":c["width"],"filled":true}),
            RichText::default(),
        );
        let SurfaceElementKind::Shape(s) = s.kind else {
            unreachable!()
        };
        let (fill, path) = rough::shape(&s, c["seed"].as_i64().unwrap() as i32);
        for (i, cs) in [fill, path].iter().enumerate() {
            let expected: Vec<_> = c["sets"][i]["ops"]
                .as_array()
                .unwrap()
                .iter()
                .map(|op| json!([op["op"], op["data"]]))
                .collect();
            close(
                &ops(cs),
                &json!(expected),
                &format!(
                    "{} radius {} seed {} set {i}",
                    c["shape"], c["radius"], c["seed"]
                ),
            );
        }
    }
}
#[test]
fn freehand_points_and_quadratics_match_javascript() {
    for c in oracle()["strokes"].as_array().unwrap() {
        for kind in ["brush", "highlighter"] {
            let e = SurfaceElement::from_properties(
                "s".into(),
                json!({"type":kind,"points":c["input"],"lineWidth":c["width"]}),
                RichText::default(),
            );
            let (SurfaceElementKind::Brush(s) | SurfaceElementKind::Highlighter(s)) = e.kind else {
                unreachable!()
            };
            let pts = strokes::outline_points(&s);
            close(
                &json!(pts.iter().copied().map(val).collect::<Vec<_>>()),
                &c["outline"],
                "outline",
            );
            let shape = strokes::svg_contour(&pts).unwrap();
            let coords: Vec<f64> = c["svg"]
                .as_str()
                .unwrap()
                .split(|c: char| c.is_whitespace() || matches!(c, 'M' | 'Q' | 'T' | 'Z' | ','))
                .filter(|s| !s.is_empty())
                .map(|s| s.parse().unwrap())
                .collect();
            assert_eq!(coords.len(), 4 + 2 * shape.edges.len());
            assert_eq!(val(shape.start), json!(&coords[..2]));
            let mut expected_ctrl = P(coords[2], coords[3]);
            for (e, p) in shape.edges.iter().zip(coords[4..].chunks_exact(2)) {
                let Edge::Quad(ctrl, end) = e else { panic!() };
                close(&val(*ctrl), &val(expected_ctrl), "quadratic control");
                close(&val(*end), &json!(p), "quadratic endpoint");
                expected_ctrl = P(p[0] * 2. - expected_ctrl.0, p[1] * 2. - expected_ctrl.1);
            }
        }
    }
}
#[test]
fn group_membership_matches_map_keys() {
    let e = SurfaceElement::from_properties(
        "g".into(),
        json!({"type":"group","children":{"a":true,"z":false}}),
        RichText::default(),
    );
    let SurfaceElementKind::Group { children, .. } = e.kind else {
        panic!()
    };
    assert_eq!(json!(children), oracle()["children"]);
}

#[test]
fn gfx_text_rtl_checks_match_javascript_regexp() {
    for case in oracle()["rtlChecks"].as_array().unwrap() {
        let text = case["text"].as_str().unwrap();
        let expected = case["rtl"].as_bool().unwrap();
        assert_eq!(
            super::rtl::is_gfx_text_rtl(text),
            expected,
            "RE_RTL_CHECK mismatch on {text:?}"
        );
    }
}

#[test]
fn connector_absolute_paths_match_javascript() {
    use std::collections::BTreeMap;
    for (i, c) in oracle()["connectors"]
        .as_array()
        .unwrap()
        .iter()
        .enumerate()
    {
        let shape = |name: &str, b: &str, rot: f64| {
            SurfaceElement::from_properties(
                name.into(),
                json!({"type":"shape","shapeType":name,"xywh":c[b],"rotate":rot}),
                RichText::default(),
            )
        };
        let a = shape(
            c["shape"].as_str().unwrap(),
            "first",
            c["rotate"].as_f64().unwrap(),
        );
        let b = shape("rect", "second", 0.);
        let mut bounds = BTreeMap::new();
        let mut kinds = BTreeMap::new();
        for (id, e) in [("a", a), ("b", b)] {
            let SurfaceElementKind::Shape(s) = e.kind else {
                unreachable!()
            };
            bounds.insert(
                id.to_string(),
                WorldBounds {
                    xywh: s.xywh,
                    rotate: e.rotate,
                },
            );
            kinds.insert(id, s.shape_type);
        }
        let e = SurfaceElement::from_properties(
            "c".into(),
            json!({"type":"connector","mode":c["mode"],"source":c["source"],"target":c["target"]}),
            RichText::default(),
        );
        let SurfaceElementKind::Connector(con) = e.kind else {
            unreachable!()
        };
        let route = connector::route(&con, &bounds, &kinds);
        let path = c["path"].as_array().unwrap();
        if path.is_empty() {
            assert!(route.is_none(), "{i}");
            continue;
        }
        let route = route.unwrap_or_else(|| panic!("missing route {i}"));
        let mut points = vec![route.contour.start];
        for e in &route.contour.edges {
            match e {
                Edge::Line(p) => points.push(*p),
                Edge::Cubic(a, b, p) => {
                    close(
                        &val(*a),
                        &path[0]["outgoing"],
                        &format!("route {i} source control"),
                    );
                    close(
                        &val(*b),
                        &path[1]["incoming"],
                        &format!("route {i} target control"),
                    );
                    points.push(*p);
                }
                _ => panic!(),
            }
        }
        close(
            &json!(points.into_iter().map(val).collect::<Vec<_>>()),
            &json!(path.iter().map(|e| &e["point"]).collect::<Vec<_>>()),
            &format!("route {i} {c}"),
        );
    }
}
