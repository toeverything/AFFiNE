use crate::collections::{HashMap, TypeIdHashMap};
use anyhow::{Context as _, Result};
pub use no_action::{NoAction, Unbind, is_no_action, is_unbind};
use serde_json::json;
use std::{
    any::{Any, TypeId},
    fmt::Display,
};

/// Defines unit structs implementing [`Action`] without any procedural macros.
#[macro_export]
macro_rules! actions {
    ($namespace:path, [ $( $(#[$attr:meta])* $name:ident),* $(,)? ]) => {
        $(
            #[derive(::std::clone::Clone, ::std::cmp::PartialEq, ::std::default::Default, ::std::fmt::Debug)]
            $(#[$attr])*
            pub struct $name;

            impl $crate::Action for $name {
                fn boxed_clone(&self) -> ::std::boxed::Box<dyn $crate::Action> {
                    ::std::boxed::Box::new(self.clone())
                }

                fn partial_eq(&self, action: &dyn $crate::Action) -> bool {
                    action.as_any().downcast_ref::<Self>().is_some_and(|other| self == other)
                }

                fn name(&self) -> &'static str {
                    concat!(stringify!($namespace), "::", stringify!($name))
                }

                fn name_for_type() -> &'static str {
                    concat!(stringify!($namespace), "::", stringify!($name))
                }

                fn build(_value: serde_json::Value) -> anyhow::Result<::std::boxed::Box<dyn $crate::Action>> {
                    Ok(::std::boxed::Box::new(Self))
                }
            }
        )*
    };
    ([ $( $(#[$attr:meta])* $name:ident),* $(,)? ]) => {
        $(
            #[derive(::std::clone::Clone, ::std::cmp::PartialEq, ::std::default::Default, ::std::fmt::Debug)]
            $(#[$attr])*
            pub struct $name;

            impl $crate::Action for $name {
                fn boxed_clone(&self) -> ::std::boxed::Box<dyn $crate::Action> {
                    ::std::boxed::Box::new(self.clone())
                }

                fn partial_eq(&self, action: &dyn $crate::Action) -> bool {
                    action.as_any().downcast_ref::<Self>().is_some_and(|other| self == other)
                }

                fn name(&self) -> &'static str {
                    stringify!($name)
                }

                fn name_for_type() -> &'static str {
                    stringify!($name)
                }

                fn build(_value: serde_json::Value) -> anyhow::Result<::std::boxed::Box<dyn $crate::Action>> {
                    Ok(::std::boxed::Box::new(Self))
                }
            }
        )*
    };
}

/// Actions represent keyboard- and command-driven intents dispatched through the element tree.
pub trait Action: Any + Send {
    fn boxed_clone(&self) -> Box<dyn Action>;
    fn partial_eq(&self, action: &dyn Action) -> bool;
    fn name(&self) -> &'static str;
    fn name_for_type() -> &'static str
    where
        Self: Sized;
    fn build(value: serde_json::Value) -> Result<Box<dyn Action>>
    where
        Self: Sized;

    fn deprecated_aliases() -> &'static [&'static str]
    where
        Self: Sized,
    {
        &[]
    }

    fn deprecation_message() -> Option<&'static str>
    where
        Self: Sized,
    {
        None
    }

    fn documentation() -> Option<&'static str>
    where
        Self: Sized,
    {
        None
    }
}

impl std::fmt::Debug for dyn Action {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("dyn Action")
            .field("name", &self.name())
            .finish()
    }
}

impl dyn Action {
    pub fn as_any(&self) -> &dyn Any {
        self as &dyn Any
    }
}

#[derive(Debug)]
pub enum ActionBuildError {
    NotFound {
        name: Box<str>,
    },
    BuildError {
        name: Box<str>,
        error: anyhow::Error,
    },
}

impl std::error::Error for ActionBuildError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            ActionBuildError::NotFound { .. } => None,
            ActionBuildError::BuildError { error, .. } => error.source(),
        }
    }
}

impl Display for ActionBuildError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ActionBuildError::NotFound { name } => {
                write!(f, "Didn't find an action named \"{name}\"")
            }
            ActionBuildError::BuildError { name, error } => {
                write!(f, "Error while building action \"{name}\": {error}")
            }
        }
    }
}

type ActionBuilder = fn(json: serde_json::Value) -> anyhow::Result<Box<dyn Action>>;

#[derive(Default)]
pub(crate) struct ActionRegistry {
    by_name: HashMap<&'static str, ActionData>,
    names_by_type_id: TypeIdHashMap<&'static str>,
    all_names: Vec<&'static str>,
    deprecated_aliases: HashMap<&'static str, &'static str>,
    deprecation_messages: HashMap<&'static str, &'static str>,
    documentation: HashMap<&'static str, &'static str>,
}

struct ActionData {
    pub build: ActionBuilder,
}

impl ActionRegistry {
    pub(crate) fn load_actions(&mut self) {
        self.register::<NoAction>();
        self.register::<Unbind>();
    }

    pub fn register<A: Action>(&mut self) {
        let name = A::name_for_type();
        if self.by_name.contains_key(name) {
            return;
        }
        self.by_name.insert(name, ActionData { build: A::build });
        for &alias in A::deprecated_aliases() {
            self.by_name.insert(alias, ActionData { build: A::build });
            self.deprecated_aliases.insert(alias, name);
            self.all_names.push(alias);
        }
        self.names_by_type_id.insert(TypeId::of::<A>(), name);
        self.all_names.push(name);
        if let Some(msg) = A::deprecation_message() {
            self.deprecation_messages.insert(name, msg);
        }
        if let Some(doc) = A::documentation() {
            self.documentation.insert(name, doc);
        }
    }

    pub fn build_action_type(&self, type_id: &TypeId) -> Result<Box<dyn Action>> {
        let name = self
            .names_by_type_id
            .get(type_id)
            .with_context(|| format!("no action type registered for {type_id:?}"))?;
        Ok(self.build_action(name, None)?)
    }

    pub fn build_action(
        &self,
        name: &str,
        params: Option<serde_json::Value>,
    ) -> std::result::Result<Box<dyn Action>, ActionBuildError> {
        let build_action = self
            .by_name
            .get(name)
            .ok_or_else(|| ActionBuildError::NotFound { name: name.into() })?
            .build;
        (build_action)(params.unwrap_or_else(|| json!({}))).map_err(|e| {
            ActionBuildError::BuildError {
                name: name.into(),
                error: e,
            }
        })
    }

    pub fn all_action_names(&self) -> &[&'static str] {
        self.all_names.as_slice()
    }

    pub fn deprecated_aliases(&self) -> &HashMap<&'static str, &'static str> {
        &self.deprecated_aliases
    }

    pub fn deprecation_messages(&self) -> &HashMap<&'static str, &'static str> {
        &self.deprecation_messages
    }

    pub fn documentation(&self) -> &HashMap<&'static str, &'static str> {
        &self.documentation
    }
}

mod no_action {
    use serde::Deserialize;

    actions!(
        ui,
        [
            /// Unbinds the keybinding this action is associated with.
            NoAction
        ]
    );

    #[derive(Clone, Debug, PartialEq, Deserialize)]
    pub struct Unbind(pub crate::SharedString);

    impl crate::Action for Unbind {
        fn boxed_clone(&self) -> Box<dyn crate::Action> {
            Box::new(self.clone())
        }

        fn partial_eq(&self, action: &dyn crate::Action) -> bool {
            action
                .as_any()
                .downcast_ref::<Self>()
                .is_some_and(|other| self == other)
        }

        fn name(&self) -> &'static str {
            "ui::Unbind"
        }

        fn name_for_type() -> &'static str {
            "ui::Unbind"
        }

        fn build(value: serde_json::Value) -> anyhow::Result<Box<dyn crate::Action>> {
            Ok(Box::new(serde_json::from_value::<Self>(value)?))
        }
    }

    pub fn is_no_action(action: &dyn crate::Action) -> bool {
        action.as_any().is::<NoAction>()
    }

    pub fn is_unbind(action: &dyn crate::Action) -> bool {
        action.as_any().is::<Unbind>()
    }
}
