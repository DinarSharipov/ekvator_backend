// Existing HTTP/database suites must not start real provider traffic when AppModule boots.
// News-specific tests inject their own transport and test bootstrap/scheduling separately.
const { NewsRuntime } = require('../../dist/news/news.service');
NewsRuntime.prototype.fetch = async () => { throw new Error('GDELT transport disabled in isolated tests'); };
NewsRuntime.prototype.sleep = async () => {};
