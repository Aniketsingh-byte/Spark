/* ==========================================================================
   products.js  -  The product catalogue.
   This is plain data. In a real full-stack app you would fetch this list
   from a database/API instead of hard-coding it (see README.md).
   ========================================================================== */
window.Spark = window.Spark || {};

Spark.PRODUCTS = [
  { id: 'p01', name: 'Aurora Wireless Headphones', category: 'Audio',      price: 149.00, oldPrice: 199.00, rating: 4.7, reviews: 213, stock: 24, emoji: '&#127911;', c1: '#6366f1', c2: '#a855f7' },
  { id: 'p02', name: 'Pulse Smart Watch S3',        category: 'Wearables',  price: 219.50, oldPrice: 0,      rating: 4.5, reviews: 148, stock: 12, emoji: '&#8986;',  c1: '#0ea5e9', c2: '#22d3ee' },
  { id: 'p03', name: 'Nimbus Bluetooth Speaker',    category: 'Audio',      price: 79.99,  oldPrice: 99.00,  rating: 4.3, reviews: 96,  stock: 51, emoji: '&#128266;', c1: '#f59e0b', c2: '#ef4444' },
  { id: 'p04', name: 'Vertex Mechanical Keyboard',  category: 'Computing',  price: 129.00, oldPrice: 0,      rating: 4.8, reviews: 305, stock: 18, emoji: '&#9000;',  c1: '#334155', c2: '#0f172a' },
  { id: 'p05', name: 'Glide Ergonomic Mouse',       category: 'Computing',  price: 45.00,  oldPrice: 59.00,  rating: 4.4, reviews: 187, stock: 77, emoji: '&#128433;', c1: '#10b981', c2: '#14b8a6' },
  { id: 'p06', name: 'Lumen 4K Webcam',             category: 'Computing',  price: 89.95,  oldPrice: 0,      rating: 4.1, reviews: 64,  stock: 9,  emoji: '&#127909;', c1: '#8b5cf6', c2: '#ec4899' },
  { id: 'p07', name: 'Volt 20000mAh Power Bank',    category: 'Accessories', price: 39.99, oldPrice: 49.99,  rating: 4.6, reviews: 421, stock: 130, emoji: '&#128267;', c1: '#22c55e', c2: '#84cc16' },
  { id: 'p08', name: 'Orbit Wireless Charger Pad',  category: 'Accessories', price: 29.50, oldPrice: 0,      rating: 4.0, reviews: 58,  stock: 0,  emoji: '&#9889;',  c1: '#f43f5e', c2: '#f97316' },
  { id: 'p09', name: 'Terra Rugged Phone Case',     category: 'Accessories', price: 24.00, oldPrice: 34.00,  rating: 4.2, reviews: 132, stock: 64, emoji: '&#128241;', c1: '#78716c', c2: '#44403c' },
  { id: 'p10', name: 'Echo Studio Monitor Speaker',  category: 'Audio',      price: 259.00, oldPrice: 0,     rating: 4.9, reviews: 41,  stock: 6,  emoji: '&#128251;', c1: '#1d4ed8', c2: '#3b82f6' },
  { id: 'p11', name: 'Halo Fitness Tracker Band',   category: 'Wearables',  price: 69.00,  oldPrice: 89.00,  rating: 4.4, reviews: 260, stock: 33, emoji: '&#128147;', c1: '#db2777', c2: '#f472b6' },
  { id: 'p12', name: 'Cascade 27" 2K Monitor',      category: 'Computing',  price: 329.00, oldPrice: 399.00, rating: 4.6, reviews: 88,  stock: 11, emoji: '&#128421;', c1: '#0891b2', c2: '#0f766e' }
];

/* Handy helpers ---------------------------------------------------------- */
Spark.catalog = {
  all: function () {
    return Spark.PRODUCTS.slice();
  },
  categories: function () {
    var seen = {}, out = [];
    Spark.PRODUCTS.forEach(function (p) {
      if (!seen[p.category]) { seen[p.category] = true; out.push(p.category); }
    });
    return out.sort();
  },
  find: function (id) {
    for (var i = 0; i < Spark.PRODUCTS.length; i++) {
      if (Spark.PRODUCTS[i].id === id) return Spark.PRODUCTS[i];
    }
    return null;
  }
};