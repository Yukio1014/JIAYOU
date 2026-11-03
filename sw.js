/* 家有 App 离线缓存
 * 目的：第二次打开直接读手机本地，不再等 GitHub Pages 下载。
 * 更新逻辑：页面请求带 ?v=<新版本号> 时强制走网络并覆盖缓存，
 *          与 index.html 里的 checkAppUpdate 配合，发布后刷新即生效。 */

var CACHE_NAME = 'jiayou-1793717826';

// 安装时就把主页面存进来，这样「第二次打开」就能直接命中，不用等第三次。
// 这一步通常直接读浏览器 HTTP 缓存（GitHub Pages 给了 10 分钟 max-age），几乎不额外耗流量。
var PRECACHE = ['./jiayou_standalone.html', './index.html'];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      // 逐个 add：任何一个 404 都不该让整个安装失败
      return Promise.all(PRECACHE.map(function (u) {
        return cache.add(u).catch(function () {});
      }));
    }).then(function () {
      self.skipWaiting();   // 新版本立刻进入等待队列，不阻塞
    })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) {
        // 只清自己的旧缓存，绝不动同域其他应用的缓存
        return k.indexOf('jiayou-') === 0 && k !== CACHE_NAME;
      }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET') return;

  var url;
  try { url = new URL(req.url); } catch (e) { return; }
  if (url.origin !== self.location.origin) return;

  // 版本探测必须实时，交给网络，不进缓存
  if (url.pathname.indexOf('version.json') >= 0) return;

  // 页面（.html / 导航请求）：缓存优先，命中就直接给，不额外跑后台请求。
  // 更新不靠这里 —— 由页面里的 version.json 检测触发带 ?v= 的刷新来覆盖缓存，
  // 这样既秒开又不浪费流量（国内流量和打开速度都要顾）。
  if (req.mode === 'navigate' || /\.html?$/.test(url.pathname)) {
    // 缓存键统一去掉 ?v= 之类的查询串，避免同一页面存出好几份
    var key = new Request(url.origin + url.pathname, { method: 'GET' });
    var forceNet = url.searchParams.has('v');   // 发布后刷新 = 必须拿新文件

    event.respondWith(
      caches.open(CACHE_NAME).then(function (cache) {
        if (forceNet) {
          return fetch(req).then(function (res) {
            if (res && res.ok) cache.put(key, res.clone());
            return res;
          }).catch(function () { return cache.match(key); });
        }
        return cache.match(key).then(function (hit) {
          if (hit) return hit;
          return fetch(req).then(function (res) {
            if (res && res.ok) cache.put(key, res.clone());
            return res;
          });
        });
      })
    );
    return;
  }

  // 图标、manifest 等静态资源：缓存优先，缺失时回源并补存
  event.respondWith(
    caches.match(req).then(function (hit) {
      if (hit) return hit;
      return fetch(req).then(function (res) {
        if (res && res.ok) {
          var copy = res.clone();
          caches.open(CACHE_NAME).then(function (c) { c.put(req, copy); });
        }
        return res;
      });
    })
  );
});
