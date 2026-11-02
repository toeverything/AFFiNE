# AFFiNE Electron App

## Development

To run AFFiNE Desktop Client Application locally, run the following commands:

```sh
# in repo root
yarn install
yarn affine @affine/native build
yarn dev

# in packages/frontend/apps/electron
yarn generate-assets
yarn dev # or yarn prod for production build
```

## Troubleshooting

If you have trouble building electron during `yarn install`, try setting mirror environment variable:

```sh
export ELECTRON_MIRROR="https://registry.npmmirror.com/-/binary/electron/"
```

### Linux: AppImage fails with a SUID sandbox error

If an AppImage aborts with `The SUID sandbox helper binary was found, but is
not configured correctly`, Chromium could not use its user namespace sandbox
and tried the `chrome-sandbox` setuid helper instead. The helper inside an
AppImage cannot provide that fallback: unprivileged FUSE mounts are `nosuid`
and read-only. Making the helper root-owned with mode `4755` in the image
would not make setuid usable on that mount.

On Ubuntu 23.10 and later, AppArmor can restrict unprivileged user namespaces
even when `kernel.unprivileged_userns_clone` is `1`. This is a host policy
requirement, not something that changing AppImage file permissions can fix.
Other causes include kernels with user namespaces disabled, container
restrictions, and different AppArmor policies. The SUID error alone does not
identify which restriction prevented the namespace sandbox from working.

#### Use the Debian package on Ubuntu

Download the `.deb` for your architecture and release channel from
[AFFiNE releases](https://github.com/toeverything/AFFiNE/releases). Install it
with the package manager, for example, from the download directory. Replace
`VERSION` below with the version you downloaded:

```sh
sudo apt install ./affine-VERSION-stable-linux-x64.deb
```

The Debian maker sets `chrome-sandbox` to mode `4755`, and the package manager
installs it as root. Unlike the AppImage, this provides Chromium with a
setuid sandbox fallback on a filesystem that permits setuid. Launch the
installed application from the application menu or with `affine`, without
sandbox-disabling flags. For a stable installation, check:

```sh
stat -c '%U:%G %a %n' /usr/lib/affine/chrome-sandbox
findmnt -T /usr/lib/affine/chrome-sandbox -o TARGET,FSTYPE,OPTIONS
```

The helper should be `root:root 4755`. Its containing directories must also
be root-owned and not writable by ordinary users. A `nosuid` filesystem,
`NoNewPrivs`, or additional security policy can still prevent this fallback.
Use the package manager to repair an incorrect installation; do not make a
helper in a user-writable extracted application setuid root.

#### Diagnose namespace restrictions

Run these from the same normal desktop session that launches AFFiNE:

```sh
cat /etc/os-release
uname -a
sysctl kernel.unprivileged_userns_clone
sysctl kernel.apparmor_restrict_unprivileged_userns
cat /proc/self/attr/current
unshare -Urnm true
```

Some kernels do not expose both sysctl keys. A failed `unshare` is evidence
of a restriction in that process context, not proof that AppArmor caused it.
A successful probe also does not guarantee that AFFiNE has the same AppArmor
profile. Check the kernel journal for relevant denials, if permitted:

```sh
journalctl -k -b --no-pager | grep -E 'apparmor="DENIED".*(userns|capable)'
```

An administrator can allow `userns,` in an AppArmor profile attached to the
exact trusted executable path, following the
[Ubuntu release notes](https://documentation.ubuntu.com/release-notes/24.04/#unprivileged-user-namespace-restrictions).
This preserves Chromium sandboxing but grants that executable access to
user namespaces; it is a security policy change. An AppImage is portable,
and the inner executable runs from a changing mount path. Do not grant
`userns` to every `/tmp/.mount_*` executable or to a broad user-writable
path. A profile for the outer AppImage file alone must not be assumed to
cover the inner executable: verify the actual process profile and launch.
Prefer the installed Debian package when a suitably scoped host policy is
not available.

Do not add `--no-sandbox` to launchers or disable AppArmor or its namespace
restriction globally. AFFiNE enables Electron sandboxing in
`src/main/index.ts` and its renderer web preferences; a launch workaround
must preserve that protection. A fatal sandbox error occurs during native
startup, so handling it only in the Electron main-process JavaScript is
not a reliable way to show an error or repair the sandbox.

#### Verify Linux release artifacts

For packaging changes, inspect both formats rather than inferring runtime
behavior from the build tree. A Debian package should contain a root-owned
setuid helper:

```sh
dpkg-deb -c ./affine-VERSION-stable-linux-x64.deb | grep chrome-sandbox
# Expected: -rwsr-xr-x root/root ... ./usr/lib/affine/chrome-sandbox
```

To inspect an AppImage without launching AFFiNE, keep this command running
in one terminal (Ctrl+C stops it):

```sh
./affine-VERSION-stable-linux-x64.appimage --appimage-mount
```

In another terminal, use the printed mount path:

```sh
findmnt -T /path/printed/by/runtime -o TARGET,FSTYPE,OPTIONS
find /path/printed/by/runtime -name chrome-sandbox -exec stat -c '%u:%g %a %n' {} \;
```

Expect a read-only `nosuid` mount. Helper metadata alone cannot establish
that the AppImage can sandbox successfully. Test an ordinary launch without
sandbox-disabling flags on a host that permits user namespaces, and test
the installed `.deb` on Ubuntu with AppArmor namespace restrictions enabled.
Use a separate test user or a disposable VM and confirm that renderer
sandboxing remains enabled, in addition to checking that a window opens.

Related reports: [#6722](https://github.com/toeverything/AFFiNE/issues/6722)
and [#8381](https://github.com/toeverything/AFFiNE/issues/8381). These reports
include older sandbox-disabling workarounds, not evidence that the current
AppImage can provide a working setuid sandbox. See also
[AppImage's Electron sandboxing documentation](https://docs.appimage.org/user-guide/troubleshooting/electron-sandboxing.html)
and [Electron's process sandboxing documentation](https://www.electronjs.org/docs/latest/tutorial/sandbox).

## Credits

Most of the boilerplate code is generously borrowed from the following

- [vite-electron-builder](https://github.com/cawa-93/vite-electron-builder)
- [Turborepo basic example](https://github.com/vercel/turborepo/tree/main/examples/basic)
- [yerba](https://github.com/t3dotgg/yerba)
