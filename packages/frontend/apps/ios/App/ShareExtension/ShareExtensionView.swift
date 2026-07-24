//
//  ShareExtensionView.swift
//  ShareExtension
//

import SwiftUI

struct ShareExtensionView: View {
  @ObservedObject var viewModel: ShareViewModel
  var onCancel: () -> Void
  var onSave: () -> Void

  var body: some View {
    NavigationStack {
      Form {
        if viewModel.isLoading {
          Section {
            HStack {
              Spacer()
              ProgressView()
              Spacer()
            }
          }
        } else {
          Section("Title") {
            TextField("Title", text: $viewModel.title)
              .textInputAutocapitalization(.sentences)
          }

          Section("Preview") {
            if let image = viewModel.previewImage {
              Image(uiImage: image)
                .resizable()
                .scaledToFit()
                .frame(maxHeight: 180)
                .clipShape(RoundedRectangle(cornerRadius: 8))
            }
            Text(viewModel.previewText)
              .font(.footnote)
              .foregroundStyle(.secondary)
              .lineLimit(6)
          }

          Section("Workspace") {
            if viewModel.hasWorkspaceCache {
              Picker("Save to", selection: $viewModel.selectedWorkspaceId) {
                ForEach(viewModel.workspaces) { workspace in
                  Text(workspace.name).tag(Optional(workspace.id))
                }
              }
            } else {
              Text("Open AFFiNE once to sync workspaces, then share again.")
                .font(.footnote)
                .foregroundStyle(.secondary)
            }
          }

          if let errorMessage = viewModel.errorMessage {
            Section {
              Text(errorMessage)
                .foregroundStyle(.red)
                .font(.footnote)
            }
          }
        }
      }
      .navigationTitle("Save to AFFiNE")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button("Cancel", action: onCancel)
            .disabled(viewModel.isSaving)
        }
        ToolbarItem(placement: .confirmationAction) {
          if viewModel.isSaving {
            ProgressView()
          } else {
            Button("Save", action: onSave)
              .disabled(viewModel.isLoading || viewModel.title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
          }
        }
      }
    }
  }
}
