export default (() => {
    'use strict';

    const COMMANDS = [
        'Sort Bookmark Children A-Z',
        'Remove Duplicate Bookmark Children',
        'Sort + Deduplicate Bookmark Children',
        'Sort All Child Blocks A-Z'
    ];

    const markdownLinkPattern = /^\s*(?:-\s+)?\[([^\]]+)\]\((https?:\/\/.+)\)\s*$/i;
    function parseBookmark(block) {
        const text = typeof block[':block/string'] === 'string' ? block[':block/string'] : '';
        const match = text.match(markdownLinkPattern);
        if (!match) return null;

        try {
            const parsedUrl = new URL(match[2]);
            if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') return null;
            return {
                block,
                title: match[1].replace(/\\([\\\[\]])/g, '$1').trim(),
                url: parsedUrl.href,
                normalizedUrl: normalizeUrl(parsedUrl.href)
            };
        } catch (error) {
            return null;
        }
    }

    function normalizeUrl(url) {
        const parsed = new URL(url);
        parsed.hostname = parsed.hostname.toLowerCase().replace(/^www\./, '');
        parsed.hash = '';
        if (parsed.pathname.length > 1) parsed.pathname = parsed.pathname.replace(/\/+$/, '');
        return parsed.href;
    }

    function hasChildren(block) {
        const children = block[':block/children'];
        return Array.isArray(children) && children.length > 0;
    }

    function getSelectedParent(uid) {
        if (!uid) throw new Error('Roam did not identify the right-clicked parent block.');
        const container = window.roamAlphaAPI.pull(
            '[:block/uid :block/string {:block/children [:block/uid :block/string :block/order {:block/children [:block/uid]}]}]',
            [':block/uid', uid]
        );
        if (!container) throw new Error('The selected parent bullet could not be read.');

        const children = Array.isArray(container[':block/children'])
            ? [...container[':block/children']].sort(
                (first, second) => (first[':block/order'] || 0) - (second[':block/order'] || 0)
            )
            : [];

        return {
            uid,
            name: container[':block/string'] || 'Selected parent block',
            children,
            bookmarks: children.map(parseBookmark).filter(Boolean)
        };
    }

    function analyzeDuplicates(bookmarks) {
        const seen = new Map();
        const removable = [];
        const protectedDuplicates = [];

        for (const bookmark of bookmarks) {
            if (!seen.has(bookmark.normalizedUrl)) {
                seen.set(bookmark.normalizedUrl, bookmark);
                continue;
            }

            if (hasChildren(bookmark.block)) protectedDuplicates.push(bookmark);
            else removable.push(bookmark);
        }

        return { removable, protectedDuplicates };
    }

    function buildSortedChildren(children) {
        const bookmarks = children.map(parseBookmark).filter(Boolean);
        const sortedBookmarks = [...bookmarks].sort((first, second) =>
            first.title.localeCompare(second.title, undefined, { sensitivity: 'base', numeric: true })
        );
        let bookmarkIndex = 0;

        return children.map(child => {
            if (!parseBookmark(child)) return child;
            const next = sortedBookmarks[bookmarkIndex];
            bookmarkIndex += 1;
            return next.block;
        });
    }

    function buildAllChildrenSorted(children) {
        return [...children].sort((first, second) => {
            const firstText = typeof first[':block/string'] === 'string' ? first[':block/string'].trim() : '';
            const secondText = typeof second[':block/string'] === 'string' ? second[':block/string'].trim() : '';
            return firstText.localeCompare(secondText, undefined, {
                sensitivity: 'base',
                numeric: true
            });
        });
    }

    function countMovedBlocks(currentChildren, desiredChildren) {
        return desiredChildren.reduce(
            (total, block, index) => total + (block[':block/uid'] !== currentChildren[index][':block/uid'] ? 1 : 0),
            0
        );
    }

    async function applyOrder(parentUid, desiredChildren) {
        for (let order = 0; order < desiredChildren.length; order += 1) {
            await window.roamAlphaAPI.moveBlock({
                location: { 'parent-uid': parentUid, order },
                block: { uid: desiredChildren[order][':block/uid'] }
            });
        }
    }

    async function deleteBlocks(bookmarks) {
        for (const bookmark of bookmarks) {
            await window.roamAlphaAPI.deleteBlock({
                block: { uid: bookmark.block[':block/uid'] }
            });
        }
    }

    function previewMessage(container, includeSort, includeDuplicates) {
        const duplicates = analyzeDuplicates(container.bookmarks);
        const desired = buildSortedChildren(container.children);
        const moved = countMovedBlocks(container.children, desired);
        const lines = [
            `Parent bullet: ${container.name}`,
            `Indented bookmark children found: ${container.bookmarks.length}`
        ];

        if (includeSort) lines.push(`Bookmark blocks that would change position: ${moved}`);
        if (includeDuplicates) {
            lines.push(`Duplicate blocks that can be removed: ${duplicates.removable.length}`);
            if (duplicates.protectedDuplicates.length) {
                lines.push(`Duplicates protected because they have children: ${duplicates.protectedDuplicates.length}`);
            }
        }

        lines.push('', 'Only bookmark links directly indented beneath this parent will be processed.');
        return { message: lines.join('\n'), duplicates, moved };
    }

    async function runCleanup({ sort, deduplicate }, parentUid) {
        try {
            let container = getSelectedParent(parentUid);
            if (!container.bookmarks.length) {
                window.alert('Bookmark Tools\n\nNo Markdown bookmark links were found directly beneath the selected parent bullet.');
                return;
            }

            const preview = previewMessage(container, sort, deduplicate);
            const plannedChanges = (sort ? preview.moved : 0)
                + (deduplicate ? preview.duplicates.removable.length : 0);
            if (!plannedChanges) {
                window.alert(`Bookmark Tools\n\n${preview.message}\n\nNothing needs to be changed.`);
                return;
            }

            if (!window.confirm(`Bookmark Tools Preview\n\n${preview.message}\n\nApply these changes?`)) return;

            let removed = 0;
            if (deduplicate && preview.duplicates.removable.length) {
                removed = preview.duplicates.removable.length;
                await deleteBlocks(preview.duplicates.removable);
                container = getSelectedParent(parentUid);
            }

            let moved = 0;
            if (sort) {
                const desired = buildSortedChildren(container.children);
                moved = countMovedBlocks(container.children, desired);
                if (moved) await applyOrder(container.uid, desired);
            }

            window.alert(
                `Bookmark Tools finished.\n\nSorted positions: ${moved}\nDuplicates removed: ${removed}`
            );
        } catch (error) {
            console.error('Bookmark Tools error:', error);
            window.alert(`Bookmark Tools could not finish.\n\n${error.message}`);
        }
    }

    async function runSortAllChildren(parentUid) {
        try {
            const container = getSelectedParent(parentUid);
            if (container.children.length < 2) {
                window.alert('Bookmark Tools\n\nThe selected parent needs at least two direct child blocks to sort.');
                return;
            }

            const desired = buildAllChildrenSorted(container.children);
            const moved = countMovedBlocks(container.children, desired);
            if (!moved) {
                window.alert('Bookmark Tools\n\nAll direct child blocks are already in alphabetical order.');
                return;
            }

            if (!window.confirm(
                `Sort All Child Blocks A-Z\n\nParent bullet: ${container.name}\n`
                + `Direct child blocks: ${container.children.length}\n`
                + `Blocks that will change position: ${moved}\n\n`
                + 'Nested children will stay attached to their current parent blocks.\n\nApply this order?'
            )) return;

            await applyOrder(container.uid, desired);
            window.alert(`Bookmark Tools finished.\n\nChild blocks moved: ${moved}`);
        } catch (error) {
            console.error('Bookmark Tools sort-all error:', error);
            window.alert(`Bookmark Tools could not sort the child blocks.\n\n${error.message}`);
        }
    }

    return {
        onload: () => {
            window.roamAlphaAPI.ui.blockContextMenu.addCommand({
                label: COMMANDS[0],
                callback: context => runCleanup(
                    { sort: true, deduplicate: false },
                    context['block-uid']
                )
            });
            window.roamAlphaAPI.ui.blockContextMenu.addCommand({
                label: COMMANDS[1],
                callback: context => runCleanup(
                    { sort: false, deduplicate: true },
                    context['block-uid']
                )
            });
            window.roamAlphaAPI.ui.blockContextMenu.addCommand({
                label: COMMANDS[2],
                callback: context => runCleanup(
                    { sort: true, deduplicate: true },
                    context['block-uid']
                )
            });
            window.roamAlphaAPI.ui.blockContextMenu.addCommand({
                label: COMMANDS[3],
                callback: context => runSortAllChildren(context['block-uid'])
            });
            console.log('Bookmark Tools extension loaded.');
        },
        onunload: () => {
            if (typeof window.roamAlphaAPI.ui.blockContextMenu.removeCommand === 'function') {
                COMMANDS.forEach(label => window.roamAlphaAPI.ui.blockContextMenu.removeCommand({ label }));
            }
            console.log('Bookmark Tools extension unloaded.');
        }
    };
})();
