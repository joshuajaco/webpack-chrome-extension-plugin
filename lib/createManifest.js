const fs = require('fs');
const { resolve } = require('path');

const loadManifestJs = (relative, mode) => {
  const path = resolve(relative);

  let manifest;
  try {
    delete require.cache[path];
    manifest = require(path);
  } catch {
    return null;
  }

  if (typeof manifest === 'function') return [manifest(mode), path];

  if (manifest === Object(manifest) && Object.keys(manifest).length !== 0) {
    return [manifest, path];
  }

  throw Error('manifest.js does not export an object or function');
};

const loadManifestJson = relative => {
  const path = resolve(relative);

  try {
    return [JSON.parse(fs.readFileSync(path)), path];
  } catch {
    return null;
  }
};

const loadManifestFile = (path, mode) => {
  const [, extension] = path.match(/\.(js|json)*$/) || [null];

  if (!extension)
    throw Error(
      `the provided manifest '${path}' does not have a supported file extension (js or json)`,
    );

  const manifest =
    extension === 'js' ? loadManifestJs(path, mode) : loadManifestJson(path);

  if (!manifest) throw Error('Provided manifest does not exist');

  return manifest;
};

const loadDefaultManifest = mode => {
  const manifest =
    loadManifestJs('manifest.js', mode) || loadManifestJson('manifest.json');

  if (!manifest) throw Error('No manifest provided');

  return manifest;
};

const loadManifest = (manifestOption, mode) => {
  switch (typeof manifestOption) {
    case 'string':
      return loadManifestFile(manifestOption, mode);
    case 'function':
      return [manifestOption(mode)];
    case 'undefined':
      return loadDefaultManifest(mode);
    case 'object':
      return [manifestOption];
    default:
      throw TypeError('Provided manifest is not a correct types');
  }
};

const createManifest = (
  compilation,
  mode,
  { host, port, contentScripts, backgroundScripts, manifest: manifestOption },
) => {
  const dev = mode === 'development';

  const manifest = {};

  const entryNames = Array.from(compilation.entrypoints.keys());

  if (contentScripts) {
    const entryFiles = entryNames.flatMap(entry =>
      compilation.entrypoints.get(entry).getFiles(),
    );

    manifest.content_scripts = contentScripts.map(({ matches, entry }) => {
      if (!entryNames.includes(entry)) {
        throw Error(
          `Entry '${entry}' provided as content script for ${matches} does not exist`,
        );
      }

      return {
        matches,
        js: compilation.entrypoints.get(entry).getFiles(),
      };
    });

    manifest.web_accessible_resources = Object.keys(compilation.assets).filter(
      asset => !entryFiles.includes(asset),
    );

    manifest.permissions = contentScripts.flatMap(({ matches }) => matches);
  }

  if (backgroundScripts) {
    manifest.background = {
      scripts: backgroundScripts.flatMap(entry => {
        if (!entryNames.includes(entry)) {
          throw Error(
            `Entry '${entry}' provided as background script does not exist`,
          );
        }

        return compilation.entrypoints.get(entry).getFiles();
      }),
    };
  }

  if (dev) {
    compilation.assets['backgroundWorker.js'] = toAsset(
      fs
        .readFileSync(resolve(__dirname, 'client.template.js'))
        .toString()
        .replace(/{{host}}/, host)
        .replace(/{{port}}/, port),
    );

    manifest.background = manifest.background || {};
    manifest.background.scripts = manifest.background.scripts || [];
    manifest.background.scripts.push('backgroundWorker.js');
  }

  const [loadedManifest, path] = loadManifest(manifestOption, mode);

  return [merge(loadedManifest, manifest), path];
};

module.exports = createManifest;
