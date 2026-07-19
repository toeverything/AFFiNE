// @generated
// This file was automatically generated and should not be edited.

import ApolloAPI

public struct CreateCheckoutSessionInput: InputObject {
  public private(set) var __data: InputDict

  public init(_ data: InputDict) {
    __data = data
  }

  public init(
    args: GraphQLNullable<JSONObject> = nil,
    coupon: GraphQLNullable<String> = nil,
    plan: GraphQLNullable<GraphQLEnum<SubscriptionPlan>> = nil,
    recurring: GraphQLNullable<GraphQLEnum<SubscriptionRecurring>> = nil,
    successCallbackLink: String,
    variant: GraphQLNullable<GraphQLEnum<SubscriptionVariant>> = nil
  ) {
    __data = InputDict([
      "args": args,
      "coupon": coupon,
      "plan": plan,
      "recurring": recurring,
      "successCallbackLink": successCallbackLink,
      "variant": variant
    ])
  }

  @available(*, deprecated, message: "Argument 'idempotencyKey' is deprecated.")
  public init(
    args: GraphQLNullable<JSONObject> = nil,
    coupon: GraphQLNullable<String> = nil,
    idempotencyKey: GraphQLNullable<String> = nil,
    plan: GraphQLNullable<GraphQLEnum<SubscriptionPlan>> = nil,
    recurring: GraphQLNullable<GraphQLEnum<SubscriptionRecurring>> = nil,
    successCallbackLink: String,
    variant: GraphQLNullable<GraphQLEnum<SubscriptionVariant>> = nil
  ) {
    __data = InputDict([
      "args": args,
      "coupon": coupon,
      "idempotencyKey": idempotencyKey,
      "plan": plan,
      "recurring": recurring,
      "successCallbackLink": successCallbackLink,
      "variant": variant
    ])
  }

  public var args: GraphQLNullable<JSONObject> {
    get { __data["args"] }
    set { __data["args"] = newValue }
  }

  public var coupon: GraphQLNullable<String> {
    get { __data["coupon"] }
    set { __data["coupon"] = newValue }
  }

  @available(*, deprecated, message: "not required anymore")
  public var idempotencyKey: GraphQLNullable<String> {
    get { __data["idempotencyKey"] }
    set { __data["idempotencyKey"] = newValue }
  }

  public var plan: GraphQLNullable<GraphQLEnum<SubscriptionPlan>> {
    get { __data["plan"] }
    set { __data["plan"] = newValue }
  }

  public var recurring: GraphQLNullable<GraphQLEnum<SubscriptionRecurring>> {
    get { __data["recurring"] }
    set { __data["recurring"] = newValue }
  }

  public var successCallbackLink: String {
    get { __data["successCallbackLink"] }
    set { __data["successCallbackLink"] = newValue }
  }

  public var variant: GraphQLNullable<GraphQLEnum<SubscriptionVariant>> {
    get { __data["variant"] }
    set { __data["variant"] = newValue }
  }
}
