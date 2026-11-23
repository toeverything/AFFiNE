//! One function body per reference template component. Text literals are the
//! JSX text after JSX whitespace folding; every `{expr}` and `{' '}` is its
//! own text node, so adjacent ones get React's `<!-- -->` separator.

use crate::{MailTemplate, OtpProps, RenderedMail, UserDocProps, UserWorkspaceUrlProps, WorkspaceProps, html::Html};

const MAGIC_LINK_EXPIRY: &str = "30 minutes";

pub(crate) fn render(template: &MailTemplate, copyright_year: i32) -> RenderedMail {
  let mut h = Html::new();
  let subject: &str = match template {
    MailTemplate::TestMail(_) => {
      h.title(|h| h.text("Test Email from AFFiNE"));
      h.content(&[&|h: &mut Html| h.p(|h| h.text("This is a test email from your AFFiNE instance."))]);
      "Test Email from AFFiNE"
    }
    MailTemplate::SignIn(props) => {
      otp_mail(&mut h, props, "in");
      "Sign in to AFFiNE"
    }
    MailTemplate::SignUp(props) => {
      otp_mail(&mut h, props, "up");
      "Your AFFiNE account is waiting for you!"
    }
    MailTemplate::SetPassword(props) => {
      h.title(|h| h.text("Set your AFFiNE password"));
      h.content(&[
        &|h: &mut Html| {
          h.p(|h| {
            h.text("Click the button below to set your password. The magic link will expire in ");
            h.bold(MAGIC_LINK_EXPIRY);
            h.text(".");
          })
        },
        &|h: &mut Html| h.button(&props.url, "Sign in to AFFiNE"),
      ]);
      "Set your AFFiNE password"
    }
    MailTemplate::ChangePassword(props) => {
      h.title(|h| h.text("Modify your AFFiNE password"));
      h.content(&[
        &|h: &mut Html| {
          h.p(|h| {
            h.text("Click the button below to reset your password. The magic link will expire in ");
            h.bold(MAGIC_LINK_EXPIRY);
            h.text(".");
          })
        },
        &|h: &mut Html| h.button(&props.url, "Set new password"),
      ]);
      "Modify your AFFiNE password"
    }
    MailTemplate::VerifyEmail(props) => {
      verify_link_mail(
        &mut h,
        "Verify your email address",
        "verify",
        &props.url,
        "Verify your email address",
      );
      "Verify your email address"
    }
    MailTemplate::ChangeEmail(props) => {
      verify_link_mail(
        &mut h,
        "Verify your current email for AFFiNE",
        "change",
        &props.url,
        "Verify and set up a new email address",
      );
      "Change your email address"
    }
    MailTemplate::VerifyChangeEmail(props) => {
      h.title(|h| h.text("Verify your new email address"));
      h.content(&[
        &|h: &mut Html| {
          h.p(|h| {
            h.text(
              "You recently requested to change the email address associated with your AFFiNE account. To complete \
               this process, please click on the verification link below. This magic link will expire in 30 minutes.",
            )
          })
        },
        &|h: &mut Html| h.button(&props.url, "Verify your new email address"),
      ]);
      "Verify your new email address"
    }
    MailTemplate::EmailChanged(props) => {
      h.title(|h| h.text("Verify your current email for AFFiNE"));
      h.content(&[&|h: &mut Html| {
        h.p(|h| {
          h.text("As per your request, we have changed your email. Please make sure you're using ");
          h.bold(&props.to);
          h.text(" to log in the next time.");
        })
      }]);
      "Account email address changed"
    }
    MailTemplate::MemberInvitation(props) => {
      let UserWorkspaceUrlProps { user, workspace, url } = props;
      h.title(|h| h.text("You are invited!"));
      h.content(&[
        &|h: &mut Html| {
          h.p(|h| {
            h.bold(&user.email);
            h.text(" invited you to join ");
            h.workspace(workspace, None);
          })
        },
        &|h: &mut Html| h.p(|h| h.text("Click button to join this workspace")),
        &|h: &mut Html| h.button(url, "Accept & Join"),
      ]);
      "You were invited to join a workspace on AFFiNE"
    }
    MailTemplate::MemberAccepted(props) => {
      let UserWorkspaceUrlProps { user, workspace, url } = props;
      h.title(|h| {
        h.text(&user.email);
        h.text(" accepted your invitation");
      });
      h.content(&[
        &|h: &mut Html| {
          h.p(|h| {
            h.bold(&user.email);
            h.text(" has joined ");
            h.workspace(workspace, None);
          })
        },
        &|h: &mut Html| h.button(url, "Open Workspace Members"),
      ]);
      "Your workspace invitation was accepted"
    }
    MailTemplate::MemberLeave(props) => {
      h.title(|h| {
        h.text("Member left ");
        h.workspace(&props.workspace, Some(24.0));
      });
      h.content(&[&|h: &mut Html| {
        h.p(|h| {
          h.bold(&props.user.email);
          h.text(" has left workspace");
          h.text(" ");
          h.workspace(&props.workspace, None);
        })
      }]);
      "A workspace member left"
    }
    MailTemplate::LinkInvitationReviewRequest(props) => {
      let UserWorkspaceUrlProps { user, workspace, url } = props;
      h.title(|h| {
        h.text("Request to join ");
        h.workspace(workspace, Some(24.0));
      });
      h.content(&[
        &|h: &mut Html| {
          h.p(|h| {
            h.bold(&user.email);
            h.text(" has requested to join ");
            h.workspace(workspace, None);
            h.text(".");
            h.br();
            h.text("As a workspace owner/admin, you can approve or decline this request.");
          })
        },
        &|h: &mut Html| h.button(url, "Review request"),
      ]);
      "New request to join a workspace"
    }
    MailTemplate::LinkInvitationApprove(props) => {
      // The reference template puts its button outside `<Content>`, and
      // `Template` renders only `<Title>` and `<Content>`.
      h.title(|h| h.text("Welcome to the workspace!"));
      h.content(&[&|h: &mut Html| {
        h.p(|h| {
          h.text("Your request to join ");
          h.workspace(&props.workspace, None);
          h.text(" has been accepted. You can now access the team workspace and collaborate with other members.");
        })
      }]);
      "Your request to join a workspace has been approved"
    }
    MailTemplate::LinkInvitationDecline(props) => {
      workspace_sentence(
        &mut h,
        "Request declined",
        "Your request to join ",
        &props.workspace,
        " has been declined by the workspace admin.",
      );
      "Your request to join a workspace was declined"
    }
    MailTemplate::MemberRemoved(props) => {
      workspace_sentence(
        &mut h,
        "Workspace access removed",
        "You have been removed from ",
        &props.workspace,
        ". You no longer have access to this workspace.",
      );
      "You have been removed from a workspace"
    }
    MailTemplate::OwnershipTransferred(props) => {
      workspace_sentence(
        &mut h,
        "Ownership transferred",
        "You have transferred ownership of ",
        &props.workspace,
        ". You are now a collaborator in this workspace.",
      );
      "Your workspace ownership has been transferred"
    }
    MailTemplate::OwnershipReceived(props) => {
      workspace_sentence(
        &mut h,
        "Welcome, new workspace owner!",
        "You have been assigned as the owner of",
        &props.workspace,
        ". As a workspace owner, you have full control over this workspace.",
      );
      "You are now the owner of a workspace"
    }
    MailTemplate::Mention(props) => {
      doc_mail(&mut h, "You are mentioned!", " mentioned you in ", props, "Open Doc");
      "You were mentioned in AFFiNE"
    }
    MailTemplate::Comment(props) => {
      doc_mail(
        &mut h,
        "You have a new comment",
        " commented on ",
        props,
        "View Comment",
      );
      "New comment in AFFiNE"
    }
    MailTemplate::CommentMention(props) => {
      doc_mail(
        &mut h,
        "You are mentioned in a comment",
        " mentioned you in a comment on ",
        props,
        "View Comment",
      );
      "You were mentioned in a comment"
    }
    MailTemplate::TeamWorkspaceUpgraded(props) => {
      h.title(|h| h.text("Welcome to the team workspace!"));
      h.content(&[
        &|h: &mut Html| {
          h.p(|h| {
            if props.is_owner {
              h.workspace(&props.workspace, None);
              h.text(" has been upgraded to team workspace with the following benefits:");
            } else {
              h.text("Great news! ");
              h.workspace(&props.workspace, None);
              h.text(" has been upgraded to team workspace by the workspace owner.");
              h.br();
              h.text("You now have access to the following enhanced features:");
            }
            for benefit in [
              " ✓ 100 GB initial storage + 20 GB per seat",
              " ✓ 500 MB of maximum file size",
              " ✓ Unlimited team members (10+ seats)",
              " ✓ Multiple admin roles",
              " ✓ Priority customer support",
            ] {
              h.br();
              h.text(benefit);
            }
          })
        },
        &|h: &mut Html| h.button(&props.url, "Open Workspace"),
      ]);
      if props.is_owner {
        "Your workspace has been upgraded to team workspace! 🎉"
      } else {
        "A workspace has been upgraded to team workspace! 🎉"
      }
    }
    MailTemplate::TeamBecomeAdmin(props) => {
      h.title(|h| h.text("You've been promoted to admin."));
      h.content(&[
        &|h: &mut Html| {
          h.p(|h| {
            h.text("You have been promoted to admin of ");
            h.workspace(&props.workspace, None);
            h.text(". As an admin, you can help the workspace owner manage members in this workspace.");
          })
        },
        &|h: &mut Html| h.button(&props.url, "Go to Workspace"),
      ]);
      "You are now a workspace admin"
    }
    MailTemplate::TeamBecomeCollaborator(props) => {
      h.title(|h| h.text("Role update in workspace"));
      h.content(&[
        &|h: &mut Html| {
          h.p(|h| {
            h.text("Your role in ");
            h.workspace(&props.workspace, None);
            h.text(" has been changed to");
            h.text(" ");
            h.text("collaborator. You can continue to collaborate in this workspace.");
          })
        },
        &|h: &mut Html| h.button(&props.url, "Go to Workspace"),
      ]);
      "Your workspace role has been changed"
    }
    MailTemplate::TeamDeleteIn24Hours(props) => {
      h.title(|h| h.text("Urgent: Last chance to prevent data loss"));
      h.content(&[
        &|h: &mut Html| {
          h.p(|h| {
            h.text("Your ");
            h.workspace(&props.workspace, None);
            h.text(" team workspace data will be permanently deleted in 24 hours on ");
            h.iso_date(&props.deletion_date);
            h.text(". To prevent data loss, please take immediate action:");
            data_loss_actions(h);
          })
        },
        &|h: &mut Html| h.button(&props.url, "Go to Billing"),
      ]);
      "[Action Required] Final warning: Your workspace will be deleted in 24 hours"
    }
    MailTemplate::TeamDeleteInOneMonth(props) => {
      h.title(|h| h.text("Take action to prevent data loss"));
      h.content(&[
        &|h: &mut Html| {
          h.p(|h| {
            h.text("Your ");
            h.workspace(&props.workspace, None);
            h.text(" team workspace expired on");
            h.text(" ");
            h.iso_date(&props.expiration_date);
            h.text(". All workspace data will be permanently deleted on ");
            h.iso_date(&props.deletion_date);
            h.text(" (180 days after expiration). To prevent data loss, please either:");
            data_loss_actions(h);
          })
        },
        &|h: &mut Html| h.button(&props.url, "Go to Billing"),
      ]);
      "[Action Required] Important: Your workspace will be deleted soon"
    }
    MailTemplate::TeamWorkspaceDeleted(props) => {
      h.title(|h| h.text("Workspace data deleted"));
      h.content(&[
        &|h: &mut Html| {
          h.p(|h| {
            h.text("All data in ");
            h.workspace(&props.workspace, None);
            h.text(
              " has been permanently deleted as the workspace remained expired for 180 days. This action cannot be \
               undone.",
            );
          })
        },
        &|h: &mut Html| {
          h.p(|h| h.text("Thank you for your support of AFFiNE. We hope to see you again in the future."))
        },
      ]);
      "Your workspace has been deleted"
    }
    MailTemplate::TeamWorkspaceExpireSoon(props) => {
      h.title(|h| h.text("Team workspace will expire soon"));
      h.content(&[
        &|h: &mut Html| {
          h.p(|h| {
            h.text("Your ");
            h.workspace(&props.workspace, None);
            h.text(" team workspace will expire on");
            h.text(" ");
            h.iso_date(&props.expiration_date);
            h.text(
              ". After expiration, you won't be able to sync or collaborate with team members. Please renew your \
               subscription to continue using all team features.",
            );
          })
        },
        &|h: &mut Html| h.button(&props.url, "Go to Billing"),
      ]);
      "[Action Required] Your team workspace will expire soon"
    }
    MailTemplate::TeamWorkspaceExpired(props) => {
      h.title(|h| h.text("Team workspace expired"));
      h.content(&[
        &|h: &mut Html| {
          h.p(|h| {
            h.text("Your ");
            h.workspace(&props.workspace, None);
            h.text(" team workspace expired on");
            h.text(" ");
            h.iso_date(&props.expiration_date);
            h.text(
              ". Your workspace can't sync or collaborate with team members. Please renew your subscription to \
               restore all team features.",
            );
          })
        },
        &|h: &mut Html| h.button(&props.url, "Go to Billing"),
      ]);
      "Your team workspace has expired"
    }
    MailTemplate::TeamLicense(props) => {
      h.title(|h| h.text("Here is your license key."));
      h.content(&[&|h: &mut Html| h.code_block(&props.license), &|h: &mut Html| {
        h.p(|h| {
          h.text("You can use this key to upgrade your selfhost workspace in");
          h.text(" ");
          h.bold("Settings > Workspace > License");
          h.text(".");
        })
      }]);
      "Your AFFiNE Self-Hosted Team Workspace license is ready"
    }
  };
  RenderedMail {
    subject: subject.to_owned(),
    html: h.finish(copyright_year),
  }
}

/// `SignIn` / `SignUp` (`verb` is `in` or `up`).
fn otp_mail(h: &mut Html, props: &OtpProps, verb: &str) {
  let server_name = props.server_name.as_deref().unwrap_or("AFFiNE");
  h.title(|h| h.text(&format!("Sign {verb} to {server_name}")));
  h.content(&[
    &|h: &mut Html| h.p(|h| h.text(&format!("You are signing {verb} to AFFiNE. Here is your code:"))),
    &|h: &mut Html| h.code_block(&props.otp),
    &|h: &mut Html| {
      h.p(|h| {
        h.text(&format!(
          "Alternatively, you can sign {verb} directly by clicking the magic link below:"
        ))
      })
    },
    &|h: &mut Html| h.button(&props.url, &format!("Sign {verb} with Magic Link")),
    &|h: &mut Html| h.p(|h| h.secondary_text(|h| h.text("This code and link will expire in 30 minutes."))),
  ]);
}

/// `VerifyEmail` / `ChangeEmail` (`action` is `verify` or `change`).
fn verify_link_mail(h: &mut Html, title: &str, action: &str, url: &str, button: &str) {
  h.title(|h| h.text(title));
  h.content(&[
    &|h: &mut Html| {
      h.p(|h| {
        h.text(&format!(
          "You recently requested to {action} the email address associated with your AFFiNE account."
        ));
        h.br();
        h.text("To complete this process, please click on the verification link below.");
      })
    },
    &|h: &mut Html| {
      h.p(|h| {
        h.text("This magic link will expire in ");
        h.bold(MAGIC_LINK_EXPIRY);
        h.text(".");
      })
    },
    &|h: &mut Html| h.button(url, button),
  ]);
}

/// Templates whose content is one paragraph around the workspace.
fn workspace_sentence(h: &mut Html, title: &str, before: &str, workspace: &WorkspaceProps, after: &str) {
  h.title(|h| h.text(title));
  h.content(&[&|h: &mut Html| {
    h.p(|h| {
      h.text(before);
      h.workspace(workspace, None);
      h.text(after);
    })
  }]);
}

/// `Mention` / `Comment` / `CommentMention`.
fn doc_mail(h: &mut Html, title: &str, action: &str, props: &UserDocProps, button: &str) {
  h.title(|h| h.text(title));
  h.content(&[
    &|h: &mut Html| {
      h.p(|h| {
        h.bold(&props.user.email);
        h.text(action);
        h.doc(&props.doc);
        h.text(".");
      })
    },
    &|h: &mut Html| h.button(&props.doc.url, button),
  ]);
}

fn data_loss_actions(h: &mut Html) {
  h.li(|h| h.text_span(|h| h.text("Renew your subscription to restore team features")));
  h.li(|h| h.text_span(|h| h.text("Export your workspace data from Workspace Settings > Export Workspace")));
}
