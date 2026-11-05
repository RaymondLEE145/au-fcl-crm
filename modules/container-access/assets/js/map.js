/* map.js — dependency-free slippy map (OSM + optional Esri imagery) */
(function(){
  var TILE = 256;
  var STYLES = {
    street: {
      label: "Street map",
      url: function(z, x, y){ return "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/" + z + "/" + y + "/" + x; },
      overlay: function(z, x, y){ return "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/" + z + "/" + y + "/" + x; },
      fallback: function(z, x, y){ return "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/" + z + "/" + y + "/" + x; },
      attribution: "<span>Map © Esri, HERE, Garmin, OpenStreetMap contributors</span>"
    },
    satellite: {
      label: "Satellite",
      url: function(z, x, y){ return "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/" + z + "/" + y + "/" + x; },
      overlay: null,
      fallback: null,
      attribution: "<span>Imagery © Esri, Maxar, Earthstar Geographics</span>"
    }
  };

  function lonToX(lon, z){ return (lon + 180) / 360 * TILE * Math.pow(2, z); }
  function latToY(lat, z){
    var rad = lat * Math.PI / 180;
    var y = (1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2;
    return y * TILE * Math.pow(2, z);
  }
  function xToLon(x, z){ return x / (TILE * Math.pow(2, z)) * 360 - 180; }
  function yToLat(y, z){
    var n = Math.PI - 2 * Math.PI * y / (TILE * Math.pow(2, z));
    return 180 / Math.PI * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
  }
  function clamp(v, a, b){ return Math.max(a, Math.min(b, v)); }

  function TileMap(container, tilesEl, markerEl, attributionEl, opts){
    this.container = container;
    this.tilesEl = tilesEl;
    this.markerEl = markerEl;
    this.attributionEl = attributionEl;
    this.opts = opts || {};
    this.lat = this.opts.lat || -33.8688;
    this.lon = this.opts.lon || 151.2093;
    this.zoom = this.opts.zoom || 17;
    this.style = "street";
    this.halfRing = null;
    this.ringEl = document.getElementById("markerRing");
    this.markerVisible = false;
    this.drag = null;
    this.raf = null;
    this.offset = false;
    this.onOffsetChange = this.opts.onOffsetChange || function(){};
    this.onZoom = this.opts.onZoom || function(){};
    this.bind();
    this.resize();
  }

  TileMap.prototype.bind = function(){
    var self = this;
    this._down = function(e){
      if (e.button !== undefined && e.button !== 0) return;
      self.drag = { x: e.clientX, y: e.clientY, lat: self.lat, lon: self.lon, moved: false };
      self.container.classList.add("dragging");
      if (self.container.setPointerCapture) self.container.setPointerCapture(e.pointerId);
    };
    this._move = function(e){
      if (!self.drag) return;
      var dx = e.clientX - self.drag.x;
      var dy = e.clientY - self.drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) self.drag.moved = true;
      var scale = TILE * Math.pow(2, self.zoom);
      var cx = lonToX(self.drag.lon, self.zoom) - dx;
      var cy = latToY(self.drag.lat, self.zoom) - dy;
      self.lat = clamp(yToLat(cy, self.zoom), -85, 85);
      self.lon = ((xToLon(cx, self.zoom) + 540) % 360) - 180;
      self.schedule();
    };
    this._up = function(){
      if (!self.drag) return;
      var moved = self.drag.moved;
      self.drag = null;
      self.container.classList.remove("dragging");
      if (moved){
        self.offset = true;
        self.onOffsetChange(true);
      }
    };
    this._wheel = function(e){
      e.preventDefault();
      self.setZoom(self.zoom + (e.deltaY < 0 ? 1 : -1));
    };
    this._dbl = function(){ self.setZoom(self.zoom + 1); };
    this.container.addEventListener("pointerdown", this._down);
    this.container.addEventListener("pointermove", this._move);
    this.container.addEventListener("pointerup", this._up);
    this.container.addEventListener("pointercancel", this._up);
    this.container.addEventListener("wheel", this._wheel, { passive: false });
    this.container.addEventListener("dblclick", this._dbl);
    window.addEventListener("resize", function(){ self.resize(); });
    if (window.ResizeObserver){
      this.ro = new ResizeObserver(function(){ self.resize(); });
      this.ro.observe(this.container);
    }
  };

  TileMap.prototype.resize = function(){
    var r = this.container.getBoundingClientRect();
    this.w = Math.max(120, Math.round(r.width));
    this.h = Math.max(120, Math.round(r.height));
    this.render();
  };

  TileMap.prototype.schedule = function(){
    var self = this;
    if (this.raf) return;
    this.raf = requestAnimationFrame(function(){ self.raf = null; self.render(); });
  };

  TileMap.prototype.maxZoom = function(){ return this.style === "street" ? 16 : 18; };
  TileMap.prototype.setView = function(lat, lon, zoom, keepOffset){
    this.lat = lat; this.lon = lon;
    if (zoom) this.zoom = clamp(zoom, 12, this.maxZoom());
    if (!keepOffset){ this.offset = false; this.onOffsetChange(false); }
    this.render();
  };

  TileMap.prototype.recentre = function(lat, lon){
    this.setView(lat, lon, this.zoom, false);
  };

  TileMap.prototype.setZoom = function(z){
    var nz = clamp(z, 12, this.maxZoom());
    if (nz === this.zoom) return;
    this.zoom = nz;
    this.render();
    this.onZoom(nz);
  };

  TileMap.prototype.toggleStyle = function(){
    this.style = this.style === "street" ? "satellite" : "street";
    this.zoom = clamp(this.zoom, 12, this.maxZoom());
    this.render();
    return this.style;
  };

  TileMap.prototype.setMarker = function(visible){
    this.markerVisible = visible;
    if (this.markerEl) this.markerEl.style.display = visible ? "block" : "none";
  };

  TileMap.prototype.setRadius = function(meters){
    if (!this.ringEl) return;
    if (!meters){
      this.ringEl.style.display = "none";
      this.halfRing = null;
      return;
    }
    this.halfRing = meters;
    this.renderRing();
  };

  TileMap.prototype.renderRing = function(){
    if (!this.ringEl || !this.halfRing) return;
    var mpp = 156543.03392 * Math.cos(this.lat * Math.PI / 180) / Math.pow(2, this.zoom);
    var size = Math.max(20, this.halfRing * 2 / mpp);
    this.ringEl.style.display = "block";
    this.ringEl.style.width = size + "px";
    this.ringEl.style.height = size + "px";
    this.ringEl.style.left = "50%";
    this.ringEl.style.top = "auto";
    this.ringEl.style.bottom = "0";
    this.ringEl.style.transform = "translate(-50%, 50%)";
  };

  TileMap.prototype.render = function(){
    if (!this.w || !this.h) return;
    var st = STYLES[this.style] || STYLES.street;
    if (this.attributionEl) this.attributionEl.innerHTML = st.attribution + "<span>Container Access AU · pre-screen map</span>";
    var z = this.zoom;
    var n = Math.pow(2, z);
    var centerX = lonToX(this.lon, z);
    var centerY = latToY(this.lat, z);
    var left = centerX - this.w / 2;
    var top = centerY - this.h / 2;
    var x0 = Math.floor(left / TILE), x1 = Math.floor((left + this.w) / TILE);
    var y0 = Math.floor(top / TILE), y1 = Math.floor((top + this.h) / TILE);
    var frag = document.createDocumentFragment();
    for (var ty = y0; ty <= y1; ty++){
      if (ty < 0 || ty >= n) continue;
      for (var tx = x0; tx <= x1; tx++){
        var wx = ((tx % n) + n) % n;
        var img = document.createElement("img");
        img.alt = "";
        img.decoding = "async";
        img.loading = "eager";
        img.referrerPolicy = "no-referrer";
        img.className = "map-tile-base tile-loading";
        img.style.left = (tx * TILE - left) + "px";
        img.style.top = (ty * TILE - top) + "px";
        img.onload = function(){ this.classList.remove("tile-loading"); };
        img.onerror = function(){
          if (st.fallback && !this.dataset.fb){ this.dataset.fb = "1"; this.src = st.fallback(z, wx, ty); return; }
          this.style.display = "none";
        };
        img.src = st.url(z, wx, ty);
        frag.appendChild(img);
        if (st.overlay){
          var ov = document.createElement("img");
          ov.alt = "";
          ov.decoding = "async";
          ov.loading = "eager";
          ov.referrerPolicy = "no-referrer";
          ov.className = "map-tile-overlay tile-loading";
          ov.style.left = (tx * TILE - left) + "px";
          ov.style.top = (ty * TILE - top) + "px";
          ov.onload = function(){ this.classList.remove("tile-loading"); };
          ov.onerror = function(){ this.style.display = "none"; };
          ov.src = st.overlay(z, wx, ty);
          frag.appendChild(ov);
        }
      }
    }
    this.tilesEl.innerHTML = "";
    this.tilesEl.appendChild(frag);
    this.renderRing();
  };

  TileMap.prototype.getCenter = function(){ return { lat: this.lat, lon: this.lon, zoom: this.zoom, offset: this.offset }; };
  TileMap.prototype.getStyle = function(){ return this.style; };
  TileMap.prototype.destroy = function(){ if (this.ro) this.ro.disconnect(); };

  window.TileMap = TileMap;
})();
