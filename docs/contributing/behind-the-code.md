# Behind the code - Code Design and Architecture of AFFiNE platform

## Introduction

This document talks about the design and architecture of AFFiNE platform.
Which might be helpful for the developers who want to contribute to AFFiNE and want to understand the principles of the design.

## Facing the problem

AFFiNE is a platform that for the next-generation collaborative knowledge base for professionals.
We might have many difficulties to build a platform that can be used by different users with different needs.

### Data might from anywhere, and might go anywhere

There are many different types of data that can be stored in AFFiNE, which might be saved
in the different places.

For example, the user who want have privacy first, can save their data in their own local device(like in the browser's indexedDB or local file of laptop).
Or the user who want to share their data with others, can save their data in the AFFiNE Cloud.
Or the user who want to share their data with others, but also want to have privacy, they can setup their own AFFiNE Cloud server.

### Customizable UI and features

AFFiNE is a platform, which means that the user can customize the UI and features of each part.

We need to consider the following cases:

- Pluggable features, some features can be disabled or enabled for example the people for personal use might not need the authentication or collaboration features. Or the enterprise user might want to have the authentication and strong security.
- SDK for the developers, the developers can build their own features and plugins for AFFiNE. like AI writing support, self-hosted database, or the features for the specific domain.

### Diverse platforms

AFFiNE have to support the different platforms, which means that the user can use AFFiNE on the different devices like desktop, mobile, and web.

Some features might be different on different platforms, for example, desktop version might have the file system support.

## The solution

### Loading Mechanism

Basically, the AFFiNE is built on the web platform, which means that the most code is running on the JavaScript runtime(v8, QuickJS, etc).
Some interfaces like in the Desktop will be implemented in the native code like Rust.

But eventually, the main logic of AFFiNE is running on the JavaScript runtime. Since it's a single-threaded runtime, we need to make sure that the code is running in the non-blocking way.

Some logic has to be running in the blocking way.

We have to set up the environment before starting the core.
And for the workspace, like local workspace or cloud workspace, we have to load the data from the storage before rendering the UI.

During this period, there will be transition animation and skeleton UI.

### Data Storage and UI Rendering
