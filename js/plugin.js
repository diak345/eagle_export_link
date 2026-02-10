const fs = require('fs');
const path = require('path');
const t = (key, params) => {
	if (typeof i18next === 'undefined' || !i18next?.t) return key;
	const lookupKey = key.includes('.') ? key : `content.${key}`;
	const value = i18next.t(lookupKey, params);
	return value || key;
};

const messageEl = () => document.querySelector('#message');
const setMessage = (html, type = 'info') => {
	const el = messageEl();
	if (!el) return;
	const safeType = type === 'success' || type === 'error' ? type : 'info';
	el.innerHTML = `<div class="notice ${safeType}">${html}</div>`;
};

const sanitizeDirName = (name) => {
	const safe = (name || '').replace(/[<>:"/\\|?*]/g, '_').trim();
	return safe.length > 0 ? safe : 'Untitled';
};

const ensureDir = async (dirPath) => {
	await fs.promises.mkdir(dirPath, { recursive: true });
};

const getFolderById = async (folderId) => {
	if (!folderId || !eagle || !eagle.folder) return null;
	if (typeof eagle.folder.getById === 'function') {
		return await eagle.folder.getById(folderId);
	}
	if (typeof eagle.folder.get === 'function') {
		return await eagle.folder.get(folderId);
	}
	return null;
};

const getFolderPathSegments = async (folder) => {
	const segments = [];
	let current = folder;
	while (current) {
		const name = sanitizeDirName(current.name || current.title || current.id);
		segments.unshift(name);
		if (!current.parent) break;
		current = await getFolderById(current.parent);
		if (!current) break;
	}
	return segments;
};

const makeUniquePath = async (destDir, baseName) => {
	const ext = path.extname(baseName);
	const nameOnly = path.basename(baseName, ext);
	let candidate = path.join(destDir, baseName);
	let index = 1;
	while (true) {
		try {
			await fs.promises.lstat(candidate);
			candidate = path.join(destDir, `${nameOnly} (${index})${ext}`);
			index += 1;
		} catch (error) {
			if (error && error.code === 'ENOENT') return candidate;
			throw error;
		}
	}
};

const createSymlink = async (sourcePath, destDir) => {
	const baseName = path.basename(sourcePath);
	const destPath = await makeUniquePath(destDir, baseName);
	await fs.promises.symlink(sourcePath, destPath, 'file');
	return destPath;
};

const createHardlink = async (sourcePath, destDir) => {
	const baseName = path.basename(sourcePath);
	const destPath = await makeUniquePath(destDir, baseName);
	await fs.promises.link(sourcePath, destPath);
	return destPath;
};

const getSelectedLinkType = () => {
	const selected = document.querySelector('input[name="linkType"]:checked');
	return selected ? selected.value : 'symlink';
};

const exportSymlinks = async () => {
	const selected = await eagle.item.getSelected();
	if (!selected || selected.length === 0) {
		setMessage(t('noItemsSelected'));
		return;
	}

	const dialog = await eagle.dialog.showOpenDialog({
		properties: ['openDirectory', 'createDirectory']
	});

	if (!dialog || dialog.canceled || !dialog.filePaths || dialog.filePaths.length === 0) {
		setMessage(t('exportCanceled'), 'info');
		return;
	}

	const exportRoot = dialog.filePaths[0];
	const selectedFolder = (await eagle.folder.getSelected())[0];
	const folderSegments = selectedFolder ? await getFolderPathSegments(selectedFolder) : [];
	const exportDir = folderSegments.length > 0 ? path.join(exportRoot, ...folderSegments) : exportRoot;
	if (folderSegments.length > 0) {
		await ensureDir(exportDir);
	}
	const linkType = getSelectedLinkType();
	const linkFn = linkType === 'hardlink' ? createHardlink : createSymlink;
	const epermHelpUrl = "https://developer.eagle.cool/plugin-api/ja-jp/tutorial/i18n";
	let successCount = 0;
	const errors = [];
	let aborted = false;

	for (const item of selected) {
		if (!item.filePath) {
			errors.push(`${item.name || item.id}: ${t('missingFilePath')}`);
			continue;
		}
		try {
			await linkFn(item.filePath, exportDir);
			successCount += 1;
		} catch (error) {
			if (linkType === 'symlink' && error && error.code === 'EPERM') {
				const link = `<a href="${epermHelpUrl}" target="_blank" rel="noopener">${epermHelpUrl}</a>`;
				errors.push(`${path.basename(item.filePath)}: ${t('errorEperm')} ${link}`);
				aborted = true;
				continue;
			}
			if (linkType === 'hardlink' && error && error.code === 'EXDEV') {
				errors.push(`${path.basename(item.filePath)}: ${t('errorExdev')}`);
				continue;
			}
			const reason = error && error.message ? error.message : String(error);
			errors.push(`${path.basename(item.filePath)}: ${reason}`);
		}
		if (aborted) break;
	}

	if (errors.length === 0) {
		setMessage(t('exportSuccess', { count: successCount, dir: exportDir }), 'success');
	} else {
		const errorList = errors.map((line) => `<li>${line}</li>`).join('');
		setMessage(`
			<div>${t('exportWithErrors', { count: successCount, dir: exportDir })}</div>
			<div>${t('errorsTitle')}</div>
			<ul>${errorList}</ul>
		`, 'error');
	}
};

eagle.onPluginCreate(async (plugin) => {
	console.log('eagle.onPluginCreate');
	const contextMenu = i18next.t('content', { returnObjects: true });
	let i18elements = document.querySelectorAll('[data-i18n]');
	i18elements.forEach((el) => {
		const key = el.getAttribute('data-i18n');
		el.textContent = contextMenu[key];
	});

	const button = document.querySelector('#exportSymlinkBtn');
	if (button) {
		button.addEventListener('click', () => {
			setMessage(t('exportingLinks'), 'info');
			exportSymlinks();
		});
	}


	try {
		const selected = await eagle.item.getSelected();
		if (!selected || selected.length === 0) {
			setMessage(t('noItemsSelectedOnLoad'), 'error');
		} else {
			setMessage(t('ready'), 'info');
		}
	} catch (error) {
		setMessage(t('ready'), 'info');
	}

});

eagle.onPluginRun(() => {
	console.log('eagle.onPluginRun');
});

eagle.onPluginShow(() => {
	console.log('eagle.onPluginShow');
});

eagle.onPluginHide(() => {
	console.log('eagle.onPluginHide');
});

eagle.onPluginBeforeExit((event) => {
	console.log('eagle.onPluginBeforeExit');
});
