use napi::{Error, Result, Status};
use serde::Serialize;
use serde_json::{Value, json};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ActionRecipe<'a> {
  action_id: &'a str,
  action_version: &'a str,
  slot: &'a str,
  prompt_ref: &'a str,
  response_contract: Value,
  output_projection: &'a str,
}

#[napi_derive::napi]
pub fn copilot_action_recipe(action_id: String, action_version: Option<String>) -> Result<String> {
  let version = action_version.as_deref().unwrap_or("v1");
  if version != "v1" {
    return Err(Error::new(Status::InvalidArg, "Action recipe not found"));
  }
  let recipe = match action_id.as_str() {
    "mindmap.generate" => structured(&action_id, "mindmap.generate", text_result_schema()),
    "slides.outline" => structured(&action_id, "slides.outline", text_result_schema()),
    "transcript.audio" => structured(
      &action_id,
      "Transcript audio structured",
      super::super::contract_schema::transcript_result_schema(),
    ),
    "image.filter.sketch" | "image.filter.clay" | "image.filter.anime" | "image.filter.pixel" => ActionRecipe {
      action_id: &action_id,
      action_version: "v1",
      slot: match action_id.as_str() {
        "image.filter.sketch" => "action.image.filter.sketch",
        "image.filter.clay" => "action.image.filter.clay",
        "image.filter.anime" => "action.image.filter.anime",
        _ => "action.image.filter.pixel",
      },
      prompt_ref: &action_id,
      response_contract: Value::Null,
      output_projection: "first_image",
    },
    _ => return Err(Error::new(Status::InvalidArg, "Action recipe not found")),
  };
  serde_json::to_string(&recipe).map_err(|error| Error::new(Status::GenericFailure, error.to_string()))
}

fn text_result_schema() -> Value {
  json!({
    "type": "object",
    "properties": { "result": { "type": "string", "minLength": 1 } },
    "required": ["result"],
    "additionalProperties": false
  })
}

fn structured<'a>(action_id: &'a str, prompt_ref: &'a str, schema: Value) -> ActionRecipe<'a> {
  ActionRecipe {
    action_id,
    action_version: "v1",
    slot: match action_id {
      "mindmap.generate" => "action.mindmap.generate",
      "slides.outline" => "action.slides.outline",
      "transcript.audio" => "transcript.audio",
      _ => unreachable!("structured recipe action is validated by the catalog"),
    },
    prompt_ref,
    response_contract: json!({ "schema": schema, "strict": true }),
    output_projection: if action_id == "slides.outline" {
      "slides_outline_markdown"
    } else if action_id == "transcript.audio" {
      "transcript_result"
    } else {
      "identity"
    },
  }
}

#[cfg(test)]
mod tests {
  use super::copilot_action_recipe;

  #[test]
  fn recipes_only_expose_slot_prompt_contract_and_projection() {
    for (id, slot) in [
      ("mindmap.generate", "action.mindmap.generate"),
      ("slides.outline", "action.slides.outline"),
      ("image.filter.sketch", "action.image.filter.sketch"),
      ("transcript.audio", "transcript.audio"),
    ] {
      let recipe = copilot_action_recipe(id.to_string(), None).unwrap();
      assert!(!recipe.contains("prepared"));
      assert!(recipe.contains(&format!("\"slot\":\"{slot}\"")));
      assert!(recipe.contains("\"promptRef\""));
      assert!(recipe.contains("\"outputProjection\""));
    }
  }
}
