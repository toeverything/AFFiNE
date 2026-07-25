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
      Group {
        if viewModel.isLoading {
          ProgressView("Reading shared content…")
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        } else {
          contentEditor
        }
      }
      .navigationTitle("Save to AFFiNE")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button("Cancel", action: onCancel)
            .disabled(viewModel.isSaving)
        }
        ToolbarItem(placement: .principal) {
          workspaceMenu
        }
        ToolbarItem(placement: .confirmationAction) {
          if viewModel.isSaving {
            ProgressView()
          } else {
            Button("Save", action: onSave)
              .fontWeight(.semibold)
              .disabled(
                viewModel.isLoading
                  || viewModel.title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
              )
          }
        }
      }
    }
  }

  @ViewBuilder
  private var workspaceMenu: some View {
    if viewModel.hasWorkspaceCache {
      Menu {
        ForEach(viewModel.workspaces) { workspace in
          Button {
            viewModel.selectedWorkspaceId = workspace.id
          } label: {
            if viewModel.selectedWorkspaceId == workspace.id {
              Label(workspace.name, systemImage: "checkmark")
            } else {
              Text(workspace.name)
            }
          }
        }
      } label: {
        HStack(spacing: 4) {
          Image(systemName: "folder")
          Text(viewModel.selectedWorkspaceName)
            .lineLimit(1)
          Image(systemName: "chevron.up.chevron.down")
            .font(.caption2)
        }
        .font(.subheadline)
      }
    } else {
      Text("AFFiNE")
        .font(.subheadline)
        .foregroundStyle(.secondary)
    }
  }

  private var contentEditor: some View {
    VStack(spacing: 0) {
      VStack(alignment: .leading, spacing: 8) {
        TextField("Title", text: $viewModel.title)
          .font(.title3.weight(.semibold))
          .textInputAutocapitalization(.sentences)

        if !viewModel.hasWorkspaceCache {
          Text("Open AFFiNE once to sync workspaces, then share again.")
            .font(.footnote)
            .foregroundStyle(.secondary)
        }

        if let errorMessage = viewModel.errorMessage {
          Text(errorMessage)
            .font(.footnote)
            .foregroundStyle(.red)
        }
      }
      .padding(.horizontal, 16)
      .padding(.top, 12)
      .padding(.bottom, 8)

      Divider()

      if let image = viewModel.previewImage {
        Image(uiImage: image)
          .resizable()
          .scaledToFit()
          .frame(maxHeight: 160)
          .padding(.horizontal, 16)
          .padding(.top, 12)
      }

      // Competitor-style: show the clip body directly and allow edits before Save.
      TextEditor(text: $viewModel.markdown)
        .font(.body)
        .scrollContentBackground(.hidden)
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
  }
}
