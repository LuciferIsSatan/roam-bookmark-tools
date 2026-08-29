# Bookmark Tools for Roam Research

Sort and remove duplicate bookmark links directly inside Roam Research while
protecting nested content and unrelated blocks.

## Features

- Sort direct bookmark children alphabetically from A–Z.
- Sort every direct child block alphabetically from A–Z, even when it is not a Markdown link.
- Remove duplicate bookmark links.
- Sort and deduplicate in one operation.
- Preview every planned change before applying it.
- Preserve non-bookmark blocks and nested bookmark children.
- Protect duplicate bookmarks that contain child blocks.
- Ignore `www`, URL fragments, and trailing slashes when detecting duplicates.

## Commands

Right-click the parent block directly above an indented bookmark list, open the
**Extensions** submenu, and choose:

- **Sort Bookmark Children A-Z**
- **Remove Duplicate Bookmark Children**
- **Sort + Deduplicate Bookmark Children**
- **Sort All Child Blocks A-Z**

Only Markdown bookmark links directly indented beneath the selected parent are
processed. The rest of the page is left unchanged.

The **Sort All Child Blocks A-Z** command is the exception: it sorts every
direct sub-bullet beneath the selected parent. Nested children remain attached
to their original parent block and move with it.

## Install as a remote developer extension

In **Roam → Settings → Roam Depot**, enable Developer Mode, click **Add
Extension by URL**, and enter the raw GitHub folder URL for this repository.
