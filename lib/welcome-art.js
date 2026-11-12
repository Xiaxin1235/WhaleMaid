import { readFile } from 'node:fs/promises';
// The artwork ships beside lib/ in the package and is read only when a welcome dialog asks for it.
const directory = new URL('../welcome/', import.meta.url);
const files = {
    motion: [
        ['dafeiyu.webp', 'image/webp'],
        ['dafeiyu.gif', 'image/gif'],
    ],
    still: [['dafeiyu-still.png', 'image/png']],
};
const cache = new Map();
async function read(choices, root) {
    for (const [name, mime] of choices) {
        try {
            const bytes = await readFile(new URL(name, root));
            return 'data:' + mime + ';base64,' + bytes.toString('base64');
        }
        catch {
            // A missing optional format falls through to the next one.
        }
    }
    return undefined;
}
/** Missing artwork is not an error: the dialog renders without an image. */
export function welcomeArt(kind, root = directory) {
    if (root !== directory)
        return read(files[kind], root);
    let pending = cache.get(kind);
    if (!pending) {
        pending = read(files[kind], root);
        cache.set(kind, pending);
    }
    return pending;
}
let mansionArt;
export function worldArt() {
    const root = new URL('../world/', import.meta.url);
    mansionArt ??= Promise.all(['letter', 'bell', 'note'].map(async (kind) => {
        const src = await read([[kind + '.png', 'image/png']], root);
        return src ? [[kind, src]] : [];
    })).then((entries) => Object.fromEntries(entries.flat()));
    return mansionArt;
}
//# sourceMappingURL=welcome-art.js.map