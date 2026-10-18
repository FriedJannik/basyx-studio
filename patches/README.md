# Dependency patches

Patches applied by pnpm (`patchedDependencies` in `pnpm-workspace.yaml`).
Each one names the exact version it is for; pnpm installs any other version
of the package without the patch and without an error, so
`test/ui/vuetify-patch.test.ts` fails when the version changes.

## vuetify@4.2.6

Server rendering and the first client render left out Vuetify's layout:

- `VAppBar` takes its height from the toolbar's template ref, which exists
  only after mount, so the server-rendered `v-main` reserved 0 px for the
  app bar (`--v-layout-top: 0px`);
- layout items (drawers, app bar) got their `top`, `left`, `width` and
  `height` only after mount, so drawers started at the top of the page.

After hydration the page and the navigation rail moved 56 px down (layout
shift 0.19 to 0.25 in Lighthouse). The patch computes the app bar's height
from its props until the ref exists, and renders layout item positions from
the registered sizes, which need no measurement.

When Vuetify is updated, Dependabot's pull request fails the patch test.
Then check whether the new version reserves the app bar and drawers in the
server-rendered HTML, for example with the patch removed and
`test/e2e/web/layout.spec.ts`:

- if it does, delete the patch file and its `patchedDependencies` entry;
- if it does not, re-create the patch for the new version
  (`pnpm patch vuetify@<version>`, apply the same two changes,
  `pnpm patch-commit <dir>`) and delete the old one.
