const { createServer } = require('http');
const Socket = require('websocket').server;
const createBackgroundWorker = require('./lib/createBackgroundWorker');
const createManifest = require('./lib/createManifest');

const name = 'MyPlugin';

const toAsset = raw => ({
  source: () => new Buffer(raw),
  size: () => Buffer.byteLength(raw),
});

const defaultOptions = { host: '127.0.0.1', port: 9003 };

class ChromeExtensionPlugin {
  constructor(options) {
    this.options = { ...defaultOptions, ...options };
    this.fileDependencies = [];
  }

  apply(compiler) {
    const { host, port } = this.options;

    compiler.hooks.compilation.tap(name, compilation => {
      compilation.hooks.additionalAssets.tap(name, () => {
        if (compiler.options.mode === 'development') {
          compilation.assets['backgroundWorker.js'] = toAsset(
            createBackgroundWorker(this.options),
          );
        }

        const [manifest, path] = createManifest(
          compilation,
          compiler.options.mode,
          this.options,
        );

        if (path) this.fileDependencies.push(path);

        compilation.assets['manifest.json'] = toAsset(JSON.stringify(manifest));
      });
    });

    compiler.hooks.afterCompile.tap(name, compilation => {
      this.fileDependencies.forEach(path => {
        compilation.fileDependencies.add(path);
      });

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
