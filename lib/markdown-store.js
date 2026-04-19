const fs = require('fs');
const path = require('path');
const archiver = require('archiver');

const { createId } = require('./data-store');

const MARKDOWN_LIBRARY_DIR = path.join(__dirname, '..', 'markdown-library');

function ensureLibraryDir() {
    fs.mkdirSync(MARKDOWN_LIBRARY_DIR, { recursive: true });
}

function normalizeContent(content = '') {
    return String(content).replace(/\r\n/g, '\n');
}

function sanitizeMarkdownFilename(filename = '', fallback = 'document.md') {
    const base = String(filename || fallback)
        .replace(/[<>:"/\\|?*\x00-\x1F]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    let safe = base || fallback;
    if (!safe.toLowerCase().endsWith('.md')) safe = `${safe}.md`;
    return safe;
}

function extractTitle(content, filename) {
    const heading = normalizeContent(content).match(/^#\s+(.+)$/m);
    if (heading?.[1]) return heading[1].trim();
    return sanitizeMarkdownFilename(filename, 'document.md').replace(/\.md$/i, '');
}

function buildExcerpt(content) {
    return normalizeContent(content)
        .split('\n')
        .map(line => line.trim())
        .filter(Boolean)
        .join(' ')
        .slice(0, 240);
}

function getStoragePath(storageName) {
    return path.join(MARKDOWN_LIBRARY_DIR, storageName);
}

function writeMarkdownContent(storageName, content) {
    ensureLibraryDir();
    fs.writeFileSync(getStoragePath(storageName), normalizeContent(content), 'utf8');
}

function readMarkdownContent(markdownFile) {
    ensureLibraryDir();
    const storagePath = getStoragePath(markdownFile.storageName);
    if (!fs.existsSync(storagePath)) return '';
    return fs.readFileSync(storagePath, 'utf8');
}

function importMarkdownFiles(files = [], options = {}) {
    ensureLibraryDir();
    const tags = Array.isArray(options.tags) ? options.tags : [];
    const description = typeof options.description === 'string' ? options.description.trim() : '';
    const now = new Date().toISOString();

    return files
        .filter(file => typeof file?.name === 'string' && file.name.trim() && typeof file?.content === 'string')
        .map(file => {
            const id = createId('md');
            const filename = sanitizeMarkdownFilename(file.name, `${id}.md`);
            const storageName = `${id}.md`;
            const content = normalizeContent(file.content);
            writeMarkdownContent(storageName, content);

            return {
                id,
                title: extractTitle(content, filename),
                filename,
                storageName,
                description,
                tags,
                size: Buffer.byteLength(content, 'utf8'),
                excerpt: buildExcerpt(content),
                createdAt: now,
                updatedAt: now,
            };
        });
}

function updateMarkdownFile(markdownFile, updates = {}) {
    const existingContent = readMarkdownContent(markdownFile);
    const nextContent = updates.content !== undefined ? normalizeContent(updates.content) : existingContent;
    if (updates.content !== undefined) {
        writeMarkdownContent(markdownFile.storageName, nextContent);
    }

    const filename = sanitizeMarkdownFilename(updates.filename || markdownFile.filename, markdownFile.filename || 'document.md');

    return {
        ...markdownFile,
        title: typeof updates.title === 'string' && updates.title.trim()
            ? updates.title.trim()
            : (markdownFile.title || extractTitle(nextContent, filename)),
        filename,
        description: typeof updates.description === 'string' ? updates.description.trim() : (markdownFile.description || ''),
        tags: Array.isArray(updates.tags) ? updates.tags : (markdownFile.tags || []),
        size: Buffer.byteLength(nextContent, 'utf8'),
        excerpt: buildExcerpt(nextContent),
        updatedAt: new Date().toISOString(),
    };
}

function deleteMarkdownFile(markdownFile) {
    const storagePath = getStoragePath(markdownFile.storageName);
    if (fs.existsSync(storagePath)) fs.unlinkSync(storagePath);
}

function getMarkdownRecord(markdownFile) {
    return {
        ...markdownFile,
        content: readMarkdownContent(markdownFile),
    };
}

function buildUniqueExportName(filename, used) {
    const sanitized = sanitizeMarkdownFilename(filename);
    if (!used.has(sanitized)) {
        used.set(sanitized, 1);
        return sanitized;
    }

    const currentCount = used.get(sanitized) + 1;
    used.set(sanitized, currentCount);
    const base = sanitized.replace(/\.md$/i, '');
    return `${base} (${currentCount}).md`;
}

function streamMarkdownZip(markdownFiles, response) {
    ensureLibraryDir();
    const archive = archiver('zip', { zlib: { level: 9 } });
    const usedNames = new Map();

    archive.on('error', error => {
        if (!response.headersSent) {
            response.status(500).json({ error: error.message || 'Failed to create zip archive.' });
        } else {
            response.destroy(error);
        }
    });

    response.setHeader('Content-Type', 'application/zip');
    response.setHeader('Content-Disposition', `attachment; filename="markdown-library-${Date.now()}.zip"`);
    archive.pipe(response);

    markdownFiles.forEach(markdownFile => {
        archive.append(readMarkdownContent(markdownFile), {
            name: buildUniqueExportName(markdownFile.filename, usedNames),
        });
    });

    archive.finalize();
}

module.exports = {
    MARKDOWN_LIBRARY_DIR,
    buildExcerpt,
    deleteMarkdownFile,
    getMarkdownRecord,
    importMarkdownFiles,
    readMarkdownContent,
    sanitizeMarkdownFilename,
    streamMarkdownZip,
    updateMarkdownFile,
};
