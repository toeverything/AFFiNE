//
//  IntelligentContext+GraphQL.swift
//  Intelligents
//
//  Created by 秋星桥 on 6/23/25.
//

import AffineGraphQL
import Apollo
import ApolloAPI
import UIKit

extension IntelligentContext {
  func prepareMetadataFromGraphQlClient(completion: @escaping ([QLMetadataKey: Any]) -> Void) {
    var newMetadata: [QLMetadataKey: Any] = [:]
    let dispatchGroup = DispatchGroup()
    let service = QLService.shared

    dispatchGroup.enter()
    service.fetchCurrentUser { user in
      if let user {
        newMetadata[.userIdentifierKey] = user.id
        newMetadata[.userNameKey] = user.name
        newMetadata[.userEmailKey] = user.email
        if let avatarUrl = user.avatarUrl {
          newMetadata[.userAvatarKey] = avatarUrl
        }
      }
      dispatchGroup.leave()
    }

    dispatchGroup.enter()
    service.fetchUserSettings { settings in
      if let settings {
        newMetadata[.userSettingsKey] = settings
      }
      dispatchGroup.leave()
    }

    dispatchGroup.enter()
    service.fetchWorkspaces { workspaces in
      newMetadata[.workspacesCountKey] = workspaces.count
      newMetadata[.workspacesKey] = workspaces.map { workspace in
        [
          "id": workspace.id,
          "team": workspace.team,
        ]
      }
      dispatchGroup.leave()
    }

    dispatchGroup.enter()
    service.fetchSubscription { subscription in
      if let subscription {
        newMetadata[.subscriptionStatusKey] = subscription.status
        newMetadata[.subscriptionPlanKey] = subscription.plan
      }
      dispatchGroup.leave()
    }

    dispatchGroup.enter()
    service.fetchQuota { quota in
      if let quota {
        newMetadata[.storageQuotaKey] = quota.storageQuota
      }
      dispatchGroup.leave()
    }

    dispatchGroup.notify(queue: .main) {
      completion(newMetadata)
    }
  }
}
