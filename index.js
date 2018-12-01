const fs = require('fs');
const { resolve } = require('path');
const { createServer } = require('http');
const Socket = require('websocket').server;

const name = 'MyPlugin';

const toAsset = raw => ({
  source: () => new Buffer(raw),
  size: () => Buffer.byteLength(raw),
});

class ChromeExtensionPlugin {
  constructor(options) {
    this.options = options || {};

    this.options.host = this.options.host || '127.0.0.1';
    this.options.port = this.options.port || 9003;

    if (!this.options.manifest) {
      if (fs.existsSync(resolve('manifest.json'))) {
        this.options.manifest = 'manifest.json';
      } else {
        throw Error('No manifest');
      }
    }
  }

  apply(compiler) {
    const { host, port, manifest: originalManifest } = this.options;

    compiler.hooks.compilation.tap(name, compilation => {
      compilation.hooks.additionalAssets.tap(name, () => {
        const dev = compiler.options.mode === 'development';

        const manifest =
          typeof originalManifest === 'string'
            ? JSON.parse(fs.readFileSync(resolve(originalManifest)))
            : originalManifest;

        if (dev) {
          compilation.assets['backgroundWorker.js'] = toAsset(
            fs
              .readFileSync(resolve(__dirname, 'client.template.js'))
              .toString()
              .replace(/{{host}}/, host)
              .replace(/{{port}}/, port),
          );

          if (manifest.background) {
            manifest.background.scripts = manifest.background.scripts || [];
            manifest.background.scripts.push('backgroundWorker.js');
          } else {
            manifest.background = {
              scripts: ['backgroundWorker.js'],
              persistent: false,
            };
          }
        }

        compilation.assets['manifest.json'] = toAsset(
          JSON.stringify(manifest, null, dev ? 2 : null),
        );

        try {
          fs.readdirSync(resolve('/public')).map(thing => {
            console.log(thing.toString());
          });
        } catch {
          console.log('no public files');
        }
      });
    });

    compiler.hooks.afterCompile.tap(name, compilation => {
      compilation.fileDependencies.add(resolve(originalManifest));

      if (this.socket) this.socket.broadcast('RELOAD_EXTENSION');
    });

    compiler.hooks.watchRun.tap(name, () => {
      if (this.socket) return;

      this.httpServer = createServer();
      this.httpServer.listen({ host, port });

      this.socket = new Socket({
        httpServer: this.httpServer,
        host,
        port,
      });

      this.socket.on('request', request => {
        request.accept(null, request.origin);
      });
    });

    compiler.hooks.watchClose.tap(name, () => {
      if (!this.socket) return;

      this.socket.shutDown();

      this.httpServer.close();
    });
  }
}

module.exports = ChromeExtensionPlugin;
