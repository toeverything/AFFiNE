use super::list::ListType;
use crate::impl_type;

impl_type!(XMLElement);
impl ListType for XMLElement {}

impl_type!(XMLFragment);
impl ListType for XMLFragment {}

impl_type!(XMLText);
impl ListType for XMLText {}

impl_type!(XMLHook);
impl ListType for XMLHook {}
