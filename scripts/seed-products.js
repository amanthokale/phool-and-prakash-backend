// Copies the starter catalogue into MongoDB. Skips products whose slug already exists.
// Usage: `npm run seed:products`
require("dotenv").config();
const mongoose = require("mongoose");
const connectDB = require("../src/config/db");
const Product = require("../src/models/Product");
const Settings = require("../src/models/Settings");

// Placeholder items until the client sends real names, prices and photos.
// Images point at files in the frontend's public/images folder.
const products = [
  { name: "Crochet Keepsakes", category: "Crochet", note: "Cuddly crochet bears and little friends, made stitch by stitch", emoji: "🧸", label: "Handmade", leadTimeDays: 5 },
  { name: "Handmade Bouquets", category: "Bouquets", note: "Forever blooms with lace, roses and globe amaranth", emoji: "💐", label: "Bestseller", leadTimeDays: 3, isFeatured: true },
  { name: "Macrame & Wind Chimes", category: "Home Decor", note: "Knotted wall pieces and chimes for a happy corner", emoji: "🪢", label: "Custom", leadTimeDays: 5 },
  { name: "Hair Accessories", category: "Little Gifts", note: "Crochet and floral barrettes and clips", emoji: "🎀", label: "Gift idea", leadTimeDays: 2 },
  { name: "Diya Holders", category: "Diwali", note: "Colourful handmade holders to light up the festive season", images: [{ url: "/images/lotus-diya-holders.png" }], emoji: "🪔", label: "Festive", leadTimeDays: 3 },
  { name: "Lanterns & Lamp Shades", category: "Diwali", note: "Customisable colours to match your space", images: [{ url: "/images/handmade-festive-lanterns.png" }], emoji: "🏮", label: "Custom", leadTimeDays: 4 },
];

const slugify = (s) => s.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

(async () => {
  await connectDB();
  await Settings.get();
  let added = 0;
  for (const [i, p] of products.entries()) {
    const slug = slugify(p.name);
    if (await Product.exists({ slug })) continue;
    await Product.create({ ...p, slug, price: null, sortOrder: i });
    added++;
  }
  console.log(`Seeded ${added} product(s). ${products.length - added} already existed.`);
  await mongoose.disconnect();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
